let videoStream = null;
let isCameraOn = false;
let detectionInterval = null;
let blinkCount = 0;
let lastEyeState = null;
let livenessConfirmed = false;
let lastBlinkTime = Date.now();

async function startVideo() {
  const video = document.getElementById('videoElement');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    videoStream = stream;
    isCameraOn = true;
    video.style.display = 'block';
    await video.play();
    detectFace(); 
  } catch (error) {
    console.error("Error accessing the webcam: ", error);
  }
}

function stopVideo() {
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
    isCameraOn = false;
    document.getElementById('videoElement').style.display = 'none';
    clearInterval(detectionInterval);
    resetLivenessDetection();
    updateStatus('None');
  }
}

function toggleCamera() {
  const button = document.getElementById('startStopButton');
  if (isCameraOn) {
    stopVideo();
    button.innerText = 'Start Camera';
  } else {
    startVideo();
    button.innerText = 'Stop Camera';
  }
}

async function detectFace() {
  const video = document.getElementById('videoElement');
  const canvas = document.getElementById('canvas');

  video.addEventListener('loadedmetadata', () => {
    video.width = video.videoWidth;
    video.height = video.videoHeight;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  });

  const displaySize = { width: video.videoWidth, height: video.videoHeight };
  faceapi.matchDimensions(canvas, displaySize);

  detectionInterval = setInterval(async () => {
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

    if (detections.length > 0) {
      faceapi.draw.drawDetections(canvas, resizedDetections);
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

      const landmarks = detections[0].landmarks;
      const expressions = detections[0].expressions;
      const emotion = getDominantEmotion(expressions);
      updateStatus(emotion);
      document.getElementById('user-face').innerText = 'Face Detected';

      detectBlink(landmarks);
    } else {
      updateStatus('None');
      document.getElementById('user-face').innerText = 'No Face Detected';
    }
  }, 100);
}

function detectBlink(landmarks) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();

  const leftEAR = calculateEAR(leftEye);
  const rightEAR = calculateEAR(rightEye);
  const avgEAR = (leftEAR + rightEAR) / 2;

  const EAR_THRESHOLD = 0.25;
  const TIME_THRESHOLD = 200;

  if (avgEAR < EAR_THRESHOLD && lastEyeState === 'open') {
    lastEyeState = 'closed';
    const currentTime = Date.now();
    if (currentTime - lastBlinkTime > TIME_THRESHOLD) {
      blinkCount++;
      lastBlinkTime = currentTime;
      livenessConfirmed = true;
      console.log('Blink detected');
    }
  } else if (avgEAR >= EAR_THRESHOLD) {
    lastEyeState = 'open';
  }
}

function calculateEAR(eye) {
  const p2p6 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
  const p3p5 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
  const p1p4 = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
  return (p2p6 + p3p5) / (2.0 * p1p4);
}

function updateStatus(emotion) {
  const statusElement = document.getElementById('status');
  statusElement.innerText = `Liveness: ${livenessConfirmed ? 'Detected' : 'Not Detected'} | Emotion: ${emotion}`;
}

function getDominantEmotion(expressions) {
  let dominantEmotion = 'None';
  let maxExpressionValue = 0;
  for (const [emotion, value] of Object.entries(expressions)) {
    if (value > maxExpressionValue) {
      dominantEmotion = emotion;
      maxExpressionValue = value;
    }
  }
  return dominantEmotion;
}

function resetLivenessDetection() {
  blinkCount = 0;
  livenessConfirmed = false;
}

async function initializeFaceAPI() {
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models/');
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models/');
  await faceapi.nets.faceExpressionNet.loadFromUri('/models/');
  console.log("FaceAPI models loaded");

  const button = document.getElementById('startStopButton');
  button.addEventListener('click', toggleCamera);
  console.log("Button event listener attached.");
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFaceAPI);
} else {
  initializeFaceAPI();
}
