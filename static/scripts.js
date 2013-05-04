$(document).ready(function() {

  var onFailSoHard = function(e) {
    console.log('Reeeejected!', e);
  };  // Note: onloadedmetadata doesn't fire in Chrome when using it with getUserMedia.

  function onSuccess(stream) {   
    var video = $('#ownVideo');
    video.get(0).src = window.URL.createObjectURL(stream);

    // Note: onloadedmetadata doesn't fire in Chrome when using it with getUserMedia.
    // See crbug.com/110938.
    video.onloadedmetadata = function(e) {
      // Ready to go. Do some stuff.
    };  

    var canvas = $('#videoCanvas').get(0);
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


/*  video.bind('play', function(){
    console.log("Hallo");
      draw(this,context,cw,ch);
  },false);
*/
  function draw(v,c,w,h) {
      //if(v.paused || v.ended) return false;

      if(v.paused) {
        v.play();
      } 
      c.drawImage(v,0,0,w,h);
      setTimeout(draw,100,v,c,w,h);
  }
}); 