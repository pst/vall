$(document).ready(function() {

  var webrtc = new WebRTC({
    // Signaling server
    url: '{{ wsendpoint }}',
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

  // we have to wait until it's ready
  webrtc.on('readyToCall', function () {
      // you can name it anything
      webrtc.joinRoom('angelhack');
  });

});
