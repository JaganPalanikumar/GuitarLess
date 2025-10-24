import React, { useState, useRef, useEffect } from 'react';
import './App.css';

//const GETURL = 'https://guitarlessbackend.azurewebsites.net'
const GETURL = 'http://guitarlessappdemo.westus.azurecontainer.io:80'


function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadScreen, setScreen]  = useState(false);

  const [statusMessage, setStatusMessage] = useState(''); 
  const [guitarlessUrl, setGuitarlessUrl] = useState('');
  const [guitarOnlyUrl, setGuitarOnlyUrl] = useState('');
  const [songName, setSongName] = useState('')
  const [errorText, setErrorText] = useState('')
  const [file, setFile] = useState(null);

  const eventSourceRef = useRef(null);

  const [percentage, setPercentage] = useState(null); 
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSSEMessage = (data) => {
    setStatusMessage(data);

    if (data === "Isolating guitar ... This may take a few minutes.") {
      setPercentage(0);
    }

    if (data.toLowerCase().startsWith("done") || data.toLowerCase().startsWith("error")) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setPercentage(null);
    }
  };

  const handleSubmit = async () => {
  if (!url.trim() && !file) {
    setErrorText('Please upload a file or enter a YouTube URL.');
    return;
  }

  setLoading(true);
  setScreen(false);
  setStatusMessage('');
  setPercentage(null);
  setElapsedSeconds(0);

  if (eventSourceRef.current) eventSourceRef.current.close();

  timerRef.current = setInterval(() => {
    setElapsedSeconds(prev => prev + 1);
  }, 1000);

  const eventSource = new EventSource(GETURL+'/progress');
  eventSourceRef.current = eventSource;

  eventSource.onmessage = (event) => {
    handleSSEMessage(event.data);
    if (event.data.toLowerCase().startsWith('done') || event.data.toLowerCase().startsWith('error')) {
      eventSource.close();
    }
  };

  eventSource.onerror = (err) => {
    console.error('SSE connection error:', err);
    eventSource.close();
  };

  try {
    let response;

    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      response = await fetch(GETURL+'/upload', {
        method: 'POST',
        body: formData,
      });
    } else {
      response = await fetch(GETURL+'/songprocessing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
    }

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Server error: ${errBody}`);
    }

    const data = await response.json();
    setGuitarlessUrl(data.guitarless);
    setGuitarOnlyUrl(data.guitar_only);
    setSongName(data.songname);

    setLoading(false);
    setScreen(true);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPercentage(null);

  } catch (err) {
    console.error('Error sending URL or file:', err);
    setErrorText('Processing failed. Please try again.');
    setStatusMessage(`Error: ${err.message}`);
    setLoading(false);
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPercentage(null);
  }
};

const handleFileUpload = async (uploadedFile) => {
  setErrorText('');
  setStatusMessage('');
  setLoading(true);
  setScreen(false);
  setPercentage(null);
  setElapsedSeconds(0);

  if (eventSourceRef.current) eventSourceRef.current.close();

  timerRef.current = setInterval(() => {
    setElapsedSeconds(prev => prev + 1);
  }, 1000);

  const eventSource = new EventSource(GETURL+'/progress');
  eventSourceRef.current = eventSource;

  eventSource.onmessage = (event) => {
    handleSSEMessage(event.data);
    if (event.data.toLowerCase().startsWith('done') || event.data.toLowerCase().startsWith('error')) {
      eventSource.close();
    }
  };

  eventSource.onerror = (err) => {
    console.error('SSE connection error:', err);
    eventSource.close();
  };

  try {
    const formData = new FormData();
    formData.append('file', uploadedFile);

    const response = await fetch(GETURL+'/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Server error: ${errBody}`);
    }

    const data = await response.json();
    setGuitarlessUrl(data.guitarless);
    setGuitarOnlyUrl(data.guitar_only);
    setSongName(data.songname);

    setLoading(false);
    setScreen(true);

    clearInterval(timerRef.current);
    timerRef.current = null;
    setPercentage(null);

  } catch (err) {
    console.error('Error uploading file:', err);
    setErrorText('File processing failed. Please try again.');
    setStatusMessage(`Error: ${err.message}`);
    setLoading(false);
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPercentage(null);
  }
};

  const handleEnter = (e) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  useEffect(() => {
    if (percentage === null) return;

    if (percentage >= 99) return;

    const interval = setInterval(() => {
      setPercentage(prev => (prev < 99 ? prev + 1 : 99));
    }, 4200); 

    return () => clearInterval(interval);
  }, [percentage]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  if (loading) {
    let loadingTitle = "Processing Song ... Please Wait";
    loadingTitle = statusMessage

    return (
      <div className="app-container">
        <div className='overlay'>
          <div className="loadingScreen">
            <div className='spinner-container'>
              <h2 className="loading-title">{loadingTitle}</h2>
              <div className='spinner'></div>
              <p className="percentage">
                {percentage === null ? "--" : `${percentage}%`} {`| ${formatTime(elapsedSeconds)}`}
              </p>
            </div>
          </div>
        </div>
        <div className='contact-footer'>
          Created by Jagan Palanikumar | For questions or concerns, please contact me at: <a href="mailto:jaganpalkumar@gmail.com" target='_blank' rel="noopener noreferrer">jaganpalkumar@gmail.com</a> | 
          Connect with me on <a href='https://www.linkedin.com/in/jagan-palanikumar/' target='_blank' rel="noopener noreferrer">LinkedIn</a>
        </div>
      </div>
    );
  }

  if (downloadScreen) {
    return (
      <div className='app-container'>
        <div className='overlay download-screen'>
          
          <div className='audio-container'>
          <div className = 'title-container'>
            <h1 className = 'download-name-title'>{songName.substring(0,songName.indexOf('.mp4'))}</h1>
          </div>

          <div className = 'audio-player-wrapper'>
            <div className='left-half'>
              <h2 className='download-text'>Download/Play Guitarless Backing Track</h2>
              {guitarlessUrl && <audio controls src={guitarlessUrl} />}
            </div>

            <div className='divider'></div>

            <div className='right-half'>
              <h2 className='download-text'>Download/Play Guitar-Only Backing Track</h2>
              {guitarOnlyUrl && <audio controls src={guitarOnlyUrl} />}
            </div>
          </div>
        </div>
        <div className = 'downloadScreen-text'>We hope you are pleased with the results! </div>
        <div className = 'downloadScreen-text-2'>Please refresh this page to try again with another song.</div>
        <div className='contact-footer'>
            Created by Jagan Palanikumar | For questions or concerns, please contact me at: <a href="mailto:jaganpalkumar@gmail.com" target='_blank' rel="noopener noreferrer">jaganpalkumar@gmail.com</a> | 
            Connect with me on <a href='https://www.linkedin.com/in/jagan-palanikumar/' target='_blank' rel="noopener noreferrer">LinkedIn</a>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="overlay" />

      <div className="frosted-title">
        <h1 className="main-title">Create Guitarless Backing Tracks From Any Song</h1>
        <p className="subtitle">
          For Free! Simply enter the YouTube URL to the song of your choosing below and download or directly play backing tracks with the isolated guitar removed using advanced music source seperation AI.
          <br /><br /><div className="update">UPDATE: Youtube doesn't like when we download their videos. If there is an error when entering a youtube music video URL, please upload a .mp3 or .wav of the music video instead. Use <a href='https://ytmp3.cx/mI5b/' target='_blank' rel="noopener noreferrer">THIS WEBSITE</a> to convert video to mp3 or wav!</div>
        </p>
      </div>

      <div className="centered-box">
        <input
          onKeyDown={handleEnter}
          type="text"
          className="url-input"
          placeholder="Enter YouTube URL Here ..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <label className="upload-btn">
          <input
            type="file"
            accept=".mp3,.wav"
            style={{ display: 'none' }}
            onChange={(e) => {
              const uploaded = e.target.files[0];
              if (uploaded) {
                setFile(uploaded);
                handleFileUpload(uploaded);
              }
            }}
          />
          Upload
        </label>

        <button className="submit-arrow" onClick={handleSubmit}>
          <svg viewBox="0 0 24 24">
            <path d="M10 17l5-5-5-5v10z" />
          </svg>
        </button>
      </div>
      <div className = 'error-text'>{errorText}</div>
      <div className='contact-footer'>
        Created by Jagan Palanikumar | For questions or concerns, please contact me at: <a href="mailto:jaganpalkumar@gmail.com" target='_blank' rel="noopener noreferrer">jaganpalkumar@gmail.com</a> | 
        Connect with me on <a href='https://www.linkedin.com/in/jagan-palanikumar/' target='_blank' rel="noopener noreferrer">LinkedIn</a>
      </div>
    </div>
  );
}

export default App;
