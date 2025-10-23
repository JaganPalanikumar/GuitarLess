from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import yt_dlp
import subprocess
import sys
from pydub import AudioSegment
import asyncio
from sse_starlette.sse import EventSourceResponse
from typing import Set
from fastapi import UploadFile, File
import shutil


app = FastAPI()

output_dir = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(output_dir, exist_ok=True)
app.mount("/output", StaticFiles(directory=output_dir), name="output")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://guitarless.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class URLRequest(BaseModel):
    url: str

_subscribers: Set[asyncio.Queue] = set()

def _broadcast(message: str):
    for q in list(_subscribers):
        try:
            q.put_nowait(message)
        except Exception:
            pass

@app.get("/progress")
async def progress():
    q: asyncio.Queue = asyncio.Queue()
    _subscribers.add(q)

    async def event_generator():
        try:
            while True:
                msg = await q.get()
                yield msg
                if msg.lower().startswith("done") or msg.lower().startswith("error"):
                    break
        finally:
            try:
                _subscribers.remove(q)
            except Exception:
                pass

    return EventSourceResponse(event_generator())

def YoutubeToMP3(url: str, mp3Folder: str) -> str:
    os.makedirs(mp3Folder, exist_ok=True)
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(mp3Folder, '%(title)s.%(ext)s'),
        'postprocessors': [],
        'quiet': False,
        'noplaylist': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        return filename

def isolateGuitar_sync(audio_path: str):
    project_dir = os.path.dirname(__file__)
    stem_dir = ""

    try:
        subprocess.run(
            [sys.executable, "-m", "demucs", "--name", "htdemucs", "--mp3", audio_path],
            cwd=project_dir,
            check=True
        )
    except subprocess.CalledProcessError:
        print("Demucs finished, ignoring TorchCodec error")
    except RuntimeError as e:
        if "Could not load libtorchcodec" in str(e):
            print("TorchCodec failed, ignoring")
        else:
            raise

    filename = os.path.splitext(os.path.basename(audio_path))[0]
    stem_dir = os.path.join(project_dir, "separated", "htdemucs", filename)

    if not os.path.exists(stem_dir):
        raise FileNotFoundError(f"Demucs output folder not found: {stem_dir}")

    guitar_path = os.path.join(stem_dir, "other.mp3")
    drums_path = os.path.join(stem_dir, "drums.mp3")
    bass_path = os.path.join(stem_dir, "bass.mp3")
    vocals_path = os.path.join(stem_dir, "vocals.mp3")

    output_folder = os.path.join(project_dir, "output")
    os.makedirs(output_folder, exist_ok=True)

    def load_mp3(path):
        if not os.path.exists(path):
            return AudioSegment.silent(duration=1000)  # fallback if missing
        seg = AudioSegment.from_file(path, format="mp3")
        return seg.set_frame_rate(44100).set_channels(2)

    guitar = load_mp3(guitar_path)
    guitar.export(os.path.join(output_folder, "Isolated_Guitar_Only.mp3"), format="mp3")

    drums = load_mp3(drums_path)
    bass = load_mp3(bass_path)
    vocals = load_mp3(vocals_path)

    # combine drums + bass + vocals for guitarless
    guitarless = drums.overlay(bass).overlay(vocals)
    guitarless.export(os.path.join(output_folder, "Guitarless.mp3"), format="mp3")

    # cleanup
    for p in [guitar_path, drums_path, bass_path, vocals_path]:
        try:
            os.remove(p)
        except FileNotFoundError:
            pass

@app.post("/songprocessing")
async def songprocessing(data: URLRequest, request: Request):
    mp3Folder = "/app/mp3Downloads"
    loop = asyncio.get_event_loop()
    user_ip = request.client.host

    try:
        await asyncio.sleep(0.1)
        _broadcast("Downloading YouTube video...")

        def get_info(url):
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': os.path.join(mp3Folder, '%(title)s.%(ext)s'),
                'quiet': False,
                'noplaylist': True,
                'nocheckcertificate': True,
                'http_headers': {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'}
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return info

        info = await loop.run_in_executor(None, get_info, data.url)
        duration = info.get('duration', 0)

        if duration > 6000:
            return JSONResponse(
                status_code=400,
                content={"error": "Song is longer than 10 minutes. Please use a shorter song."}
            )

        file_path = await loop.run_in_executor(None, YoutubeToMP3, data.url, mp3Folder)

        _broadcast("Isolating guitar ... This may take a few minutes.")

        await loop.run_in_executor(None, isolateGuitar_sync, file_path)

        _broadcast("Done")

        BACKEND_URL = "http://guitarlessappdemo.westus2.azurecontainer.io:8000"
        guitar_only_url = f"{BACKEND_URL}/output/Isolated_Guitar_Only.mp3"
        guitarless_url = f"{BACKEND_URL}/output/Guitarless.mp3"

        os.remove(file_path)

        return JSONResponse(content={
            "guitar_only": guitar_only_url,
            "guitarless": guitarless_url,
            "songname": os.path.basename(file_path)
        })
    except Exception as exc:
        err_msg = f"Error: {str(exc)}"
        _broadcast(err_msg)
        return JSONResponse(status_code=500, content={"error": str(exc)})
    
@app.post("/upload")
async def upload_song(file: UploadFile = File(...)):
    try:
        temp_dir = os.path.join(os.path.dirname(__file__), "uploads")
        os.makedirs(temp_dir, exist_ok=True)

        temp_path = os.path.join(temp_dir, file.filename)
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        _broadcast("Isolating guitar ... This may take a few minutes.")
        await asyncio.get_event_loop().run_in_executor(None, isolateGuitar_sync, temp_path)
        _broadcast("Done")

        BACKEND_URL = "http://guitarlessappdemo.westus2.azurecontainer.io:8000"
        guitar_only_url = f"{BACKEND_URL}/output/Isolated_Guitar_Only.mp3"
        guitarless_url = f"{BACKEND_URL}/output/Guitarless.mp3"

        os.remove(temp_path)

        return JSONResponse(content={
            "guitar_only": guitar_only_url,
            "guitarless": guitarless_url,
            "songname": file.filename
        })

    except Exception as exc:
        err_msg = f"Error: {str(exc)}"
        _broadcast(err_msg)
        return JSONResponse(status_code=500, content={"error": str(exc)})
