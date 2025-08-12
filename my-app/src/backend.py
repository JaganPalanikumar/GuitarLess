from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import yt_dlp
import os
import subprocess
import sys
from pydub import AudioSegment
import asyncio
from sse_starlette.sse import EventSourceResponse
from typing import Set

app = FastAPI()

output_dir = os.path.join(os.path.dirname(__file__), "output")
os.makedirs(output_dir, exist_ok=True)
app.mount("/output", StaticFiles(directory=output_dir), name="output")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
    subprocess.run([sys.executable, "-m", "demucs", "--name", "htdemucs", audio_path], cwd=project_dir, check=True)

    filename = os.path.splitext(os.path.basename(audio_path))[0]
    stem_dir = os.path.join(project_dir, "separated", "htdemucs", filename)

    guitar_path = os.path.join(stem_dir, "other.wav")
    drums_path = os.path.join(stem_dir, "drums.wav")
    bass_path = os.path.join(stem_dir, "bass.wav")
    vocals_path = os.path.join(stem_dir, "vocals.wav")

    output_folder = os.path.join(project_dir, "output")
    os.makedirs(output_folder, exist_ok=True)

    guitar = AudioSegment.from_wav(guitar_path)
    guitar.export(os.path.join(output_folder, "Isolated_Guitar_Only.mp3"), format="mp3")

    drums = AudioSegment.from_wav(drums_path)
    bass = AudioSegment.from_wav(bass_path)
    vocals = AudioSegment.from_wav(vocals_path)
    guitarless = drums.overlay(bass).overlay(vocals)
    guitarless.export(os.path.join(output_folder, "Guitarless.mp3"), format="mp3")

    os.remove(guitar_path)
    os.remove(drums_path)
    os.remove(bass_path)
    os.remove(vocals_path)

@app.post("/songprocessing")
async def songprocessing(data: URLRequest, request: Request):
    mp3Folder = "C:/Users/jagan/Desktop/GuitarIsolater/my-app/src/mp3Downloads"
    loop = asyncio.get_event_loop()
    user_ip = request.client.host

    try:
        await asyncio.sleep(0.1)
        _broadcast("Downloading YouTube video...")

        def get_info(url):
            ydl_opts = {
                'format': 'bestaudio/best',
                'quiet': True,
                'noplaylist': True,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                return info

        info = await loop.run_in_executor(None, get_info, data.url)
        duration = info.get('duration', 0)  

        if duration > 6000:
            return JSONResponse(status_code = 400, content={"error": "Song is longer than 10 minutes. Please use a shorter song."})

        file_path = await loop.run_in_executor(None, YoutubeToMP3, data.url, mp3Folder)

        _broadcast("Isolating guitar ... This may take a few minutes.")

        await loop.run_in_executor(None, isolateGuitar_sync, file_path)

        _broadcast("Done")

        guitar_only_url = "http://localhost:8000/output/Isolated_Guitar_Only.mp3"
        guitarless_url = "http://localhost:8000/output/Guitarless.mp3"

        os.remove(file_path)

        return JSONResponse(content={
            "guitar_only": guitar_only_url,
            "guitarless": guitarless_url,
            'songname': os.path.basename(file_path)
        })
    except Exception as exc:
        err_msg = f"Error: {str(exc)}"
        _broadcast(err_msg)
        return JSONResponse(status_code=500, content={"error": str(exc)})
