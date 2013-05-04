  var onFailSoHard = function(e) {
    console.log('Reeeejected!', e);
  };  // Note: onloadedmetadata doesn't fire in Chrome when using it with getUserMedia.

  function onSuccess(stream) {   
    var video = $('#ownVideo');
    video.src = window.URL.createObjectURL(stream);

    // Note: onloadedmetadata doesn't fire in Chrome when using it with getUserMedia.
    // See crbug.com/110938.
    video.onloadedmetadata = function(e) {
      // Ready to go. Do some stuff.
      console.log(e);
    };  
  }

  window.URL = window.URL || window.webkitURL;
  navigator.getUserMedia  = navigator.getUserMedia || navigator.webkitGetUserMedia ||
                            navigator.mozGetUserMedia || navigator.msGetUserMedia;

  if (navigator.getUserMedia) {
    navigator.getUserMedia({video: true}, onSuccess, onFailSoHard);
  } else {
    alert('Sorry, your browser does not support vall.me');
  }

/*var v = $('#ownVideo');
var canvas = $('#videoCanvas');
var context = canvas[0].getContext('2d');
var cw = Math.floor(canvas[0].clientWidth / 100);
var ch = Math.floor(canvas[0].clientHeight / 100);
canvas.width = cw;
canvas.height = ch;

v.bind('play', function(){
    draw(this,context,cw,ch);
},false);

function draw(v,c,w,h) {
    if(v.paused || v.ended) return false;
    c.drawImage(v,0,0,w,h);
    setTimeout(draw,20,v,c,w,h);
}*/