import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadScreen, setScreen]  = useState(false);

  const [statusMessage, setStatusMessage] = useState(''); 
  const [guitarlessUrl, setGuitarlessUrl] = useState('');
  const [guitarOnlyUrl, setGuitarOnlyUrl] = useState('');
  const [songName, setSongName] = useState('')
  const [errorText, setErrorText] = useState('')

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
    if (url.trim() === "") {
      setErrorText('Error: Enter a valid YouTube URL!');
      return;
    }
    setLoading(true);
    setScreen(false);
    setStatusMessage("");
    setPercentage(null);
    setElapsedSeconds(0);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }


    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    const eventSource = new EventSource('http://guitarlessappdemo.westus.azurecontainer.io:8000/progress');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      handleSSEMessage(event.data);

      if (event.data.toLowerCase().startsWith("done") || event.data.toLowerCase().startsWith("error")) {
        eventSource.close();
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      eventSource.close();
    };

    try {
      const response = await fetch('http://guitarlessappdemo.westus.azurecontainer.io:8000/songprocessing', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const errBody = await response.text();
        setErrorText('Song is longer than 10 minutes. Please use a shorter song.')
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
      console.error('Error sending URL:', err);
      setErrorText('Error: Enter a valid YouTube URL!')
      setStatusMessage(`Error: ${err.message}`);
      setLoading(false);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
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
        </p>
      </div>

      <div className="centered-box">
        <input
          onKeyDown={handleEnter}
          type="text"
          className="url-input"
          placeholder="Enter Youtube URL Here ... "
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
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
