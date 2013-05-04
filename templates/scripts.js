$(document).ready(function() {

/*  var onFailSoHard = function(e) {
    alert("You have to allow access to your webcam!");
  };  // Note: onloadedmetadata doesn't fire in Chrome when using it with getUserMedia.

  function onSuccess(stream) {   
    var video = $('#ownVideo');
    video.get(0).src = window.URL.createObjectURL(stream);

    // Note: onloadedmetadata doesn't fire in Chrome when using it with getUserMedia.
    // See crbug.com/110938.
    video.onloadedmetadata = function(e) {
      // Ready to go. Do some stuff.
    };  

    var canvas = $('#ownCanvas').get(0);
    var context = canvas.getContext('2d');
    var cw = canvas.clientWidth;
    var ch = canvas.clientHeight;  
    canvas.width = cw;
    canvas.height = ch;
    draw(video.get(0),context,cw,ch);    
  }

  window.URL = window.URL || window.webkitURL;
  navigator.getUserMedia  = navigator.getUserMedia || navigator.webkitGetUserMedia ||
                            navigator.mozGetUserMedia || navigator.msGetUserMedia;

  if (navigator.getUserMedia) {
    navigator.getUserMedia({video: true}, onSuccess, onFailSoHard);
  } else {
    alert('Sorry, your browser does not support vall.me');
  }

  function draw(v,c,w,h) {
      //if(v.paused || v.ended) return false;
      if(v.paused) {
        v.play();
      } 
      c.drawImage(v,0,0,w,h);
      setTimeout(draw,100,v,c,w,h);
  }*/

/*  // note: make sure hostname available to all connecting clients
  // (ie. probably not `localhost`)
  rtc.connect('ws://{{ wsendpoint }}/echo');

  rtc.createStream({"video": true, "audio":false}, function(stream){
    // get local stream for manipulation
    rtc.attachStream(stream, 'ownVideo');
  });

  rtc.on('add remote stream', function(stream){
    // show the remote video
    rtc.attachStream(stream, 'remoteVideo');
  });*/
 

  var webrtc = new WebRTC({
    // Signaling server
    // the id/element dom element that will hold "our" video
    localVideoEl: 'localVideo',
    // the id/element dom element that will hold remote videos
    remoteVideosEl: 'remotesVideos',
    // immediately ask for camera access
    autoRequestMedia: true,
    media: {
      audio: false,
      video: {
          mandatory: {},
          optional: []
      }
    }
  });

  try {
    webrtc.joinRoom('angelhack');
  } catch(e) {
    console.log(e);
  }

  // we have to wait until it's ready
  webrtc.on('readyToCall', function () {
      console.log("Call is ready");
      // you can name it anything
      webrtc.joinRoom('angelhack');
  });

});