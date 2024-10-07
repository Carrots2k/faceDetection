let videoStream = null; // Variable to hold the video stream from the camera
let isCameraOn = false; // Flag to check if the camera is on
let detectionInterval = null; // Interval ID for face detection
let blinkCount = 0; // Count of detected blinks
let lastEyeState = 'open'; // State of the last eye check (open/closed)
let livenessConfirmed = false; // Flag to confirm liveness
let lastBlinkTime = Date.now(); // Timestamp of the last blink
let lastHeadPosition = null; // Store last known head position for movement detection
let movementThreshold = 5; // Sensitivity threshold for head movement
let currentEmotion = 'None'; // Variable to store the current dominant emotion

async function startVideo() {
  const video = document.getElementById('videoElement');
  try {
    // Get access to the webcam
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream; // Set the video source to the stream
    videoStream = stream; // Store the stream
    isCameraOn = true; // Update camera state
    video.style.display = 'block'; // Show video element
    await video.play(); // Play the video
    detectFace(); // Start detecting faces
  } catch (error) {
    console.error("Error accessing the webcam: ", error); // Handle errors
  }
}

function stopVideo() {
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop()); // Stop all video tracks
    videoStream = null; // Clear the stream
    isCameraOn = false; // Update camera state
    document.getElementById('videoElement').style.display = 'none'; // Hide video
    clearInterval(detectionInterval); // Stop face detection
    resetLivenessDetection(); // Reset liveness detection variables
    updateStatus('None'); // Update status to reflect no detection
  }
}

function toggleCamera() {
  const button = document.getElementById('startStopButton');
  if (isCameraOn) {
    stopVideo(); // stop the video if it is  on
    button.innerText = 'Start Camera'; // Update button text
  } else {
    startVideo(); // start the video if it is  off
    button.innerText = 'Stop Camera'; // Update button text
  }
}

async function detectFace() {
  const video = document.getElementById('videoElement');
  const canvas = document.getElementById('canvas');
  
  // Set video and canvas dimensions when metadata is loaded
  video.addEventListener('loadedmetadata', () => {
    video.width = video.videoWidth; // Set video width
    video.height = video.videoHeight; // Set video height
    canvas.width = video.videoWidth; // Set canvas width
    canvas.height = video.videoHeight; // Set canvas height
  });

  const displaySize = { width: video.videoWidth, height: video.videoHeight }; // Get current display size
  faceapi.matchDimensions(canvas, displaySize); // Match canvas size with video size

  detectionInterval = setInterval(async () => {
    // Detect all faces and their landmarks and expressions
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions();

    const resizedDetections = faceapi.resizeResults(detections, displaySize); // Resize detections for canvas

    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); // Clear previous drawings

    if (detections.length > 0) {
      // Draw detected faces and landmarks on the canvas
      faceapi.draw.drawDetections(canvas, resizedDetections);
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

      const landmarks = detections[0].landmarks; // Get landmarks from the first detected face
      const expressions = detections[0].expressions; // Get expressions from the first detected face
      detectBlink(landmarks); // Check for blinks
      detectHeadMovement(landmarks); // Check for head movement

      currentEmotion = getDominantEmotion(expressions); // Determine the dominant emotion
      updateStatus(currentEmotion); // Update status with the current emotion
      document.getElementById('user-face').innerText = 'Face Detected'; // Update user feedback
    } else {
      updateStatus('None'); // Update status if no face detected
      document.getElementById('user-face').innerText = 'No Face Detected'; // User feedback for no face
    }
  }, 100); // Run detection every 100ms
}

function updateStatus(emotion) {
  const statusElement = document.getElementById('status');
  // Display liveness and emotion status
  statusElement.innerText = `Liveness: ${livenessConfirmed ? 'Detected' : 'Not Detected'} | Emotion: ${emotion}`;
}

function eyeAspectRatio(eye) {
  // Calculate the Eye Aspect Ratio (EAR) for blink detection
  const A = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y); // Vertical distance
  const B = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y); // Vertical distance
  const C = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y); // Horizontal distance
  
  const ear = (A + B) / (2.0 * C); // Compute EAR
  return ear;
}

function detectBlink(landmarks) {
  const leftEye = landmarks.getLeftEye(); // Get left eye landmarks
  const rightEye = landmarks.getRightEye(); // Get right eye landmarks
  const leftEAR = eyeAspectRatio(leftEye); // Calculate EAR for left eye
  const rightEAR = eyeAspectRatio(rightEye); // Calculate EAR for right eye
  const ear = (leftEAR + rightEAR) / 2.0; // Average EAR

  if (ear < 0.25) {  // Blink detection threshold
    if (lastEyeState === 'open') { // Check if eye was previously open
      blinkCount++; // Increment blink count
      lastBlinkTime = Date.now(); // Update last blink time
      lastEyeState = 'closed';  // Update state to closed
    }
  } else {
    // Update state to open
    lastEyeState = 'open'; 
  }

  // If multiple blinks are detected, we confirm liveness...
  if (blinkCount > 1) {
    // Set liveness confirmed
    livenessConfirmed = true; 
    updateStatus(currentEmotion); 
  }
}

function detectHeadMovement(landmarks) {
  // we get nose landmark
  const nose = landmarks.getNose(); 
  const currentHeadPosition = {
    // Current head position x
    x: nose[0].x, 
    // Current head position y
    y: nose[0].y  
  };

  if (lastHeadPosition) {
    // Calculating the movement of the head...
    const deltaX = Math.abs(currentHeadPosition.x - lastHeadPosition.x);
    const deltaY = Math.abs(currentHeadPosition.y - lastHeadPosition.y);
    const totalMovement = deltaX + deltaY;

    // Confirming liveness if movement exceeds threshold...
    if (totalMovement > movementThreshold) {
      // Set liveness confirmed
      livenessConfirmed = true; 
       // Update status
      updateStatus(currentEmotion);
    }
  }
// storing I current head position for next detection...
  lastHeadPosition = currentHeadPosition; 
}

function getDominantEmotion(expressions) {
  let dominantEmotion = 'None'; // Default emotion...
  let maxExpressionValue = 0; // Maximum expression value tracker...
  for (const [emotion, value] of Object.entries(expressions)) {
    // Find the emotion with the highest value...
    if (value > maxExpressionValue) {
      dominantEmotion = emotion; // Update dominant emotion
      maxExpressionValue = value; // Update max value
    }
  }
  // Return the dominant emotion...
  return dominantEmotion; 
}

function resetLivenessDetection() {
  blinkCount = 0; // Reset blink count...
  livenessConfirmed = false; // Reset liveness flag...
  lastHeadPosition = null; // Clear last head position...
}

async function initializeFaceAPI() {
  // Load FaceAPI models from the local models directory...
  await faceapi.nets.tinyFaceDetector.loadFromUri('/models/');
  await faceapi.nets.faceLandmark68Net.loadFromUri('/models/');
  await faceapi.nets.faceExpressionNet.loadFromUri('/models/');
  console.log("FaceAPI models loaded");

  const button = document.getElementById('startStopButton');
  button.addEventListener('click', toggleCamera); // Attach click event to toggle camera
}

// Initialize face API models once the DOM is fully loaded...
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeFaceAPI);
} else {
  // we have to call initialize immediately if DOM is ready...
  initializeFaceAPI(); 
}
