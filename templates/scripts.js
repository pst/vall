$(document).ready(function() {

  var webrtc = new WebRTC({
    // Signaling server
    url: '{{ wsendpoint }}',
    // the id/element dom element that will hold "our" video
    localVideoEl: 'videos',
    // the id/element dom element that will hold remote videos
    remoteVideosEl: 'videos',
    // immediately ask for camera access
    autoRequestMedia: true,
    // Disable audio
    media: {
      audio: false,
      video: {
          mandatory: {},
          optional: []
      }
    },
    // Debugging
    log: false
  });

  // we have to wait until it's ready
  webrtc.on('readyToCall', function () {
      // you can name it anything
      webrtc.joinRoom("{{ name }}");
      subdivideVideos();      
  });

  webrtc.on('videoAdded', function () {
      subdivideVideos();      
  });

  webrtc.on('videoRemoved', function () {
      subdivideVideos();      
  });

  var joinButton = $('#joinButton');
  joinButton.bind('click', function() {
    webrtc.startLocalVideo();
  });

  function getNumPerRow() {
    var len = $('#videos').find('video').length;
    //var len = videos.length;
    var biggest;

    // Ensure length is even for better division.
    if(len % 2 === 1) {
      len++;
    }

    biggest = Math.ceil(Math.sqrt(len));
    while(len % biggest !== 0) {
      biggest++;
    }
    return biggest;
  }

  function setWH(video, i) {
    var perRow = getNumPerRow();
    var len = $('#videos').find('video').length;    
    var perColumn = Math.ceil(len / perRow);
    var width = Math.floor((window.innerWidth/100*95) / perRow);
    var height = Math.floor((window.innerHeight - 90) / perColumn);
    video.width = width;
    video.height = height;
  }  

  function subdivideVideos() {
    var perRow = getNumPerRow();
    var numInRow = 0;
    var videos = $('#videos').find('video');
    var vlen = videos.length;

    for(var i = 0, len = vlen; i < len; i++) {
      var video = videos[i];
      setWH(video, i);
      numInRow = (numInRow + 1) % perRow;
    }
  }  

  $(window).resize(function() {
    subdivideVideos();
  }); 

});