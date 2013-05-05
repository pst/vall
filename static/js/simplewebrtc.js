;(function () {

var logger = {
    log: function (){},
    warn: function (){},
    error: function (){}
};

// normalize environment
var RTCPeerConnection = null,
    getUserMedia = null,
    attachMediaStream = null,
    reattachMediaStream = null,
    browser = null,
    webRTCSupport = true;

if (navigator.mozGetUserMedia) {
    logger.log("This appears to be Firefox");

    browser = "firefox";

    // The RTCPeerConnection object.
    RTCPeerConnection = mozRTCPeerConnection;

    // The RTCSessionDescription object.
    RTCSessionDescription = mozRTCSessionDescription;

    // The RTCIceCandidate object.
    RTCIceCandidate = mozRTCIceCandidate;

    // Get UserMedia (only difference is the prefix).
    // Code from Adam Barth.
    getUserMedia = navigator.mozGetUserMedia.bind(navigator);

    // Attach a media stream to an element.
    attachMediaStream = function(element, stream) {
        element.mozSrcObject = stream;
        element.play();
    };

    reattachMediaStream = function(to, from) {
        to.mozSrcObject = from.mozSrcObject;
        to.play();
    };

    // Fake get{Video,Audio}Tracks
    MediaStream.prototype.getVideoTracks = function() {
        return [];
    };

    MediaStream.prototype.getAudioTracks = function() {
        return [];
    };
} else if (navigator.webkitGetUserMedia) {
    browser = "chrome";

    // The RTCPeerConnection object.
    RTCPeerConnection = webkitRTCPeerConnection;

    // Get UserMedia (only difference is the prefix).
    // Code from Adam Barth.
    getUserMedia = navigator.webkitGetUserMedia.bind(navigator);

    // Attach a media stream to an element.
    attachMediaStream = function(element, stream) {
        element.autoplay = true;
        element.src = webkitURL.createObjectURL(stream);
    };

    reattachMediaStream = function(to, from) {
        to.src = from.src;
    };

    // The representation of tracks in a stream is changed in M26.
    // Unify them for earlier Chrome versions in the coexisting period.
    if (!webkitMediaStream.prototype.getVideoTracks) {
        webkitMediaStream.prototype.getVideoTracks = function() {
            return this.videoTracks;
        };
        webkitMediaStream.prototype.getAudioTracks = function() {
            return this.audioTracks;
        };
    }

    // New syntax of getXXXStreams method in M26.
    if (!webkitRTCPeerConnection.prototype.getLocalStreams) {
        webkitRTCPeerConnection.prototype.getLocalStreams = function() {
            return this.localStreams;
        };
        webkitRTCPeerConnection.prototype.getRemoteStreams = function() {
            return this.remoteStreams;
        };
    }
} else {
    webRTCSupport = false;
    throw new Error("Browser does not appear to be WebRTC-capable");
}


// emitter that we use as a base
function WildEmitter() {
    this.callbacks = {};
}

// Listen on the given `event` with `fn`. Store a group name if present.
WildEmitter.prototype.on = function (event, groupName, fn) {
    var hasGroup = (arguments.length === 3),
        group = hasGroup ? arguments[1] : undefined,
        func = hasGroup ? arguments[2] : arguments[1];
    func._groupName = group;
    (this.callbacks[event] = this.callbacks[event] || []).push(func);
    return this;
};

// Adds an `event` listener that will be invoked a single
// time then automatically removed.
WildEmitter.prototype.once = function (event, fn) {
    var self = this;
    function on() {
        self.off(event, on);
        fn.apply(this, arguments);
    }
    this.on(event, on);
    return this;
};

// Unbinds an entire group
WildEmitter.prototype.releaseGroup = function (groupName) {
    var item, i, len, handlers;
    for (item in this.callbacks) {
        handlers = this.callbacks[item];
        for (i = 0, len = handlers.length; i < len; i++) {
            if (handlers[i]._groupName === groupName) {
                handlers.splice(i, 1);
                i--;
                len--;
            }
        }
    }
    return this;
};

// Remove the given callback for `event` or all
// registered callbacks.
WildEmitter.prototype.off = function (event, fn) {
    var callbacks = this.callbacks[event],
        i;

    if (!callbacks) return this;

    // remove all handlers
    if (arguments.length === 1) {
        delete this.callbacks[event];
        return this;
    }

    // remove specific handler
    i = callbacks.indexOf(fn);
    callbacks.splice(i, 1);
    return this;
};

// Emit `event` with the given args.
// also calls any `*` handlers
WildEmitter.prototype.emit = function (event) {
    var args = [].slice.call(arguments, 1),
        callbacks = this.callbacks[event],
        specialCallbacks = this.getWildcardCallbacks(event),
        i,
        len,
        item;

    if (callbacks) {
        for (i = 0, len = callbacks.length; i < len; ++i) {
            callbacks[i].apply(this, args);
        }
    }

    if (specialCallbacks) {
        for (i = 0, len = specialCallbacks.length; i < len; ++i) {
            specialCallbacks[i].apply(this, [event].concat(args));
        }
    }

    return this;
};

// Helper for for finding special wildcard event handlers that match the event
WildEmitter.prototype.getWildcardCallbacks = function (eventName) {
    var item,
        split,
        result = [];

    for (item in this.callbacks) {
        split = item.split('*');
        if (item === '*' || (split.length === 2 && eventName.slice(0, split[1].length) === split[1])) {
            result = result.concat(this.callbacks[item]);
        }
    }
    return result;
};


function WebRTC(opts) {
    var self = this,
        options = opts || {},
        config = this.config = {
            url: 'http://signaling.simplewebrtc.com:8888',
            log: false,
            localVideoEl: '',
            remoteVideosEl: '',
            autoRequestMedia: false,
            // makes the entire PC config overridable
            peerConnectionConfig: {
                iceServers: browser == 'firefox' ? [{"url":"stun:124.124.124.2"}] : [{"url": "stun:stun.l.google.com:19302"}]
            },
            peerConnectionContraints: {
                optional: [{"DtlsSrtpKeyAgreement": true}]
            },
            media: {
                audio:true,
                video: {
                    mandatory: {},
                    optional: []
                }
            }
        },
        item,
        connection;

    // check for support
    if (!webRTCSupport) {
        console.error('Your browser doesn\'t seem to support WebRTC');
    }

    // set options
    for (item in options) {
        this.config[item] = options[item];
    }

    // log if configured to
    if (this.config.log) logger = console;

    // where we'll store our peer connections
    this.pcs = {};

    // our socket.io connection
    connection = this.connection = io.connect(this.config.url);

    connection.on('connect', function () {
        self.emit('ready', connection.socket.sessionid);
        self.sessionReady = true;
        self.testReadiness();
    });

    connection.on('message', function (message) {
        var existing = self.pcs[message.from];
        if (existing) {
            existing.handleMessage(message);
        } else {
            // create the conversation object
            self.pcs[message.from] = new Conversation({
                id: message.from,
                parent: self,
                initiator: false
            });
            self.pcs[message.from].handleMessage(message);
        }
    });

    connection.on('joined', function (room) {
        logger.log('got a joined', room);
        if (!self.pcs[room.id]) {
            self.startVideoCall(room.id);
        }
    });
    connection.on('left', function (room) {
        var conv = self.pcs[room.id];
        if (conv) conv.handleStreamRemoved();
    });

    WildEmitter.call(this);

    // log events
    this.on('*', function (event, val1, val2) {
        logger.log('event:', event, val1, val2);
    });

    // auto request if configured
    if (this.config.autoRequestMedia) this.startLocalVideo();
}

WebRTC.prototype = Object.create(WildEmitter.prototype, {
    constructor: {
        value: WebRTC
    }
});

WebRTC.prototype.getEl = function (idOrEl) {
    if (typeof idOrEl == 'string') {
        return document.getElementById(idOrEl);
    } else {
        return idOrEl;
    }
};

// this accepts either element ID or element
// and either the video tag itself or a container
// that will be used to put the video tag into.
WebRTC.prototype.getLocalVideoContainer = function () {
    var el = this.getEl(this.config.localVideoEl);
    if (el && el.tagName === 'VIDEO') {
        return el;
    } else {
        var video = document.createElement('video');
        video.setAttribute('class', 'vid');
        //var canvas = document.createElement('canvas');
        el.appendChild(video);
        return video;
    }
};

WebRTC.prototype.getRemoteVideoContainer = function () {
    return this.getEl(this.config.remoteVideosEl);
};

WebRTC.prototype.startVideoCall = function (id) {
    this.pcs[id] = new Conversation({
        id: id,
        parent: this,
        initiator: true
    });
    this.pcs[id].start();
};

WebRTC.prototype.createRoom = function (name, cb) {
    if (arguments.length === 2) {
        this.connection.emit('create', name, cb);
    } else {
        this.connection.emit('create', name);
    }
};

WebRTC.prototype.joinRoom = function (name) {
    this.connection.emit('join', name);
    this.roomName = name;
};

WebRTC.prototype.leaveRoom = function () {
    if (this.roomName) {
        this.connection.emit('leave', this.roomName);
        for (var pc in this.pcs) {
            this.pcs[pc].end();
        }
    }
};

WebRTC.prototype.testReadiness = function () {
    var self = this;
    if (this.localStream && this.sessionReady) {
        // This timeout is a workaround for the strange no-audio bug
        // as described here: https://code.google.com/p/webrtc/issues/detail?id=1525
        // remove timeout when this is fixed.
        setTimeout(function () {
            self.emit('readyToCall', self.connection.socket.sessionid);
        }, 1000);
    }
};

WebRTC.prototype.startLocalVideo = function (element) {
    var self = this;
    getUserMedia(this.config.media, function (stream) {
        attachMediaStream(element || self.getLocalVideoContainer(), stream);
        self.localStream = stream;
        self.testReadiness();
    }, function () {
        throw new Error('Failed to get access to local media.');
    });
};


WebRTC.prototype.send = function (to, type, payload) {
    this.connection.emit('message', {
        to: to,
        type: type,
        payload: payload
    });
};


function Conversation(options) {
    var self = this;

    this.id = options.id;
    this.parent = options.parent;
    this.initiator = options.initiator;
    // Create an RTCPeerConnection via the polyfill (adapter.js).
    this.pc = new RTCPeerConnection(this.parent.config.peerConnectionConfig, this.parent.config.peerConnectionContraints);
    this.pc.onicecandidate = this.onIceCandidate.bind(this);
    this.pc.addStream(this.parent.localStream);
    this.pc.onaddstream = this.handleRemoteStreamAdded.bind(this);
    this.pc.onremovestream = this.handleStreamRemoved.bind(this);
    // for re-use
    this.mediaConstraints = {
        'mandatory': {
            'OfferToReceiveAudio':true,
            'OfferToReceiveVideo':true
        }
    };
    WildEmitter.call(this);

    // proxy events to parent
    this.on('*', function (name, value) {
        self.parent.emit(name, value, self);
    });
}

Conversation.prototype = Object.create(WildEmitter.prototype, {
    constructor: {
        value: Conversation
    }
});

Conversation.prototype.handleMessage = function (message) {
    if (message.type === 'offer') {
        logger.log('setting remote description');
        this.pc.setRemoteDescription(new RTCSessionDescription(message.payload));
        this.answer();
    } else if (message.type === 'answer') {
        this.pc.setRemoteDescription(new RTCSessionDescription(message.payload));
    } else if (message.type === 'candidate') {
        console.log('message.payload', message.payload);
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.payload.label,
            candidate: message.payload.candidate
        });
        this.pc.addIceCandidate(candidate);
    }
};

Conversation.prototype.send = function (type, payload) {
    this.parent.send(this.id, type, payload);
};

Conversation.prototype.onIceCandidate = function (event) {
    if (this.closed) return;
    if (event.candidate) {
        this.send('candidate', {
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
      logger.log("End of candidates.");
    }
};

Conversation.prototype.start = function () {
    var self = this;
    this.pc.createOffer(function (sessionDescription) {
        logger.log('setting local description');
        self.pc.setLocalDescription(sessionDescription);
        logger.log('sending offer', sessionDescription);
        self.send('offer', sessionDescription);
    }, null, this.mediaConstraints);
};

Conversation.prototype.end = function () {
    this.pc.close();
    this.handleStreamRemoved();
};

Conversation.prototype.answer = function () {
    var self = this;
    logger.log('answer called');
    this.pc.createAnswer(function (sessionDescription) {
        logger.log('setting local description');
        self.pc.setLocalDescription(sessionDescription);
        logger.log('sending answer', sessionDescription);
        self.send('answer', sessionDescription);
    }, null, this.mediaConstraints);
};

Conversation.prototype.handleRemoteStreamAdded = function (event) {
    var stream = this.stream = event.stream,
        el = document.createElement('video'),
        container = this.parent.getRemoteVideoContainer();
    //el.setAttribute('class', 'vid');
    el.id = this.id;
    attachMediaStream(el, stream);
    if (container) container.appendChild(el);
    this.emit('videoAdded', el);
};

Conversation.prototype.handleStreamRemoved = function () {
    var video = document.getElementById(this.id),
        container = this.parent.getRemoteVideoContainer();
    if (video && container) container.removeChild(video);
    this.emit('videoRemoved', video);
    delete this.parent.pcs[this.id];
    this.closed = true;
};

// expose WebRTC
window.WebRTC = WebRTC;
}());

var io="undefined"==typeof module?{}:module.exports;(function(){(function(e,t){var n=e;n.version="0.9.11",n.protocol=1,n.transports=[],n.j=[],n.sockets={},n.connect=function(e,r){var i,s,o=n.util.parseUri(e);t&&t.location&&(o.protocol=o.protocol||t.location.protocol.slice(0,-1),o.host=o.host||(t.document?t.document.domain:t.location.hostname),o.port=o.port||t.location.port),i=n.util.uniqueUri(o);var u={host:o.host,secure:"https"==o.protocol,port:o.port||("https"==o.protocol?443:80),query:o.query||""};return n.util.merge(u,r),(u["force new connection"]||!n.sockets[i])&&(s=new n.Socket(u)),!u["force new connection"]&&s&&(n.sockets[i]=s),s=s||n.sockets[i],s.of(o.path.length>1?o.path:"")}})("object"==typeof module?module.exports:this.io={},this),function(e,t){var n=e.util={},r=/^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/,i=["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"];n.parseUri=function(e){for(var t=r.exec(e||""),n={},s=14;s--;)n[i[s]]=t[s]||"";return n},n.uniqueUri=function(e){var n=e.protocol,r=e.host,i=e.port;return"document"in t?(r=r||document.domain,i=i||("https"==n&&"https:"!==document.location.protocol?443:document.location.port)):(r=r||"localhost",i||"https"!=n||(i=443)),(n||"http")+"://"+r+":"+(i||80)},n.query=function(e,t){var r=n.chunkQuery(e||""),i=[];n.merge(r,n.chunkQuery(t||""));for(var s in r)r.hasOwnProperty(s)&&i.push(s+"="+r[s]);return i.length?"?"+i.join("&"):""},n.chunkQuery=function(e){for(var t,n={},r=e.split("&"),i=0,s=r.length;s>i;++i)t=r[i].split("="),t[0]&&(n[t[0]]=t[1]);return n};var s=!1;n.load=function(e){return"document"in t&&"complete"===document.readyState||s?e():(n.on(t,"load",e,!1),void 0)},n.on=function(e,t,n,r){e.attachEvent?e.attachEvent("on"+t,n):e.addEventListener&&e.addEventListener(t,n,r)},n.request=function(e){if(e&&"undefined"!=typeof XDomainRequest&&!n.ua.hasCORS)return new XDomainRequest;if("undefined"!=typeof XMLHttpRequest&&(!e||n.ua.hasCORS))return new XMLHttpRequest;if(!e)try{return new(window[["Active"].concat("Object").join("X")])("Microsoft.XMLHTTP")}catch(t){}return null},"undefined"!=typeof window&&n.load(function(){s=!0}),n.defer=function(e){return n.ua.webkit&&"undefined"==typeof importScripts?(n.load(function(){setTimeout(e,100)}),void 0):e()},n.merge=function(e,t,r,i){var s,o=i||[],u=r===void 0?2:r;for(s in t)t.hasOwnProperty(s)&&0>n.indexOf(o,s)&&("object"==typeof e[s]&&u?n.merge(e[s],t[s],u-1,o):(e[s]=t[s],o.push(t[s])));return e},n.mixin=function(e,t){n.merge(e.prototype,t.prototype)},n.inherit=function(e,t){function n(){}n.prototype=t.prototype,e.prototype=new n},n.isArray=Array.isArray||function(e){return"[object Array]"===Object.prototype.toString.call(e)},n.intersect=function(e,t){for(var r=[],i=e.length>t.length?e:t,s=e.length>t.length?t:e,o=0,u=s.length;u>o;o++)~n.indexOf(i,s[o])&&r.push(s[o]);return r},n.indexOf=function(e,t,n){for(var r=e.length,n=0>n?0>n+r?0:n+r:n||0;r>n&&e[n]!==t;n++);return n>=r?-1:n},n.toArray=function(e){for(var t=[],n=0,r=e.length;r>n;n++)t.push(e[n]);return t},n.ua={},n.ua.hasCORS="undefined"!=typeof XMLHttpRequest&&function(){try{var e=new XMLHttpRequest}catch(t){return!1}return void 0!=e.withCredentials}(),n.ua.webkit="undefined"!=typeof navigator&&/webkit/i.test(navigator.userAgent),n.ua.iDevice="undefined"!=typeof navigator&&/iPad|iPhone|iPod/i.test(navigator.userAgent)}(io!==void 0?io:module.exports,this),function(e,t){function n(){}e.EventEmitter=n,n.prototype.on=function(e,n){return this.$events||(this.$events={}),this.$events[e]?t.util.isArray(this.$events[e])?this.$events[e].push(n):this.$events[e]=[this.$events[e],n]:this.$events[e]=n,this},n.prototype.addListener=n.prototype.on,n.prototype.once=function(e,t){function n(){r.removeListener(e,n),t.apply(this,arguments)}var r=this;return n.listener=t,this.on(e,n),this},n.prototype.removeListener=function(e,n){if(this.$events&&this.$events[e]){var r=this.$events[e];if(t.util.isArray(r)){for(var i=-1,s=0,o=r.length;o>s;s++)if(r[s]===n||r[s].listener&&r[s].listener===n){i=s;break}if(0>i)return this;r.splice(i,1),r.length||delete this.$events[e]}else(r===n||r.listener&&r.listener===n)&&delete this.$events[e]}return this},n.prototype.removeAllListeners=function(e){return void 0===e?(this.$events={},this):(this.$events&&this.$events[e]&&(this.$events[e]=null),this)},n.prototype.listeners=function(e){return this.$events||(this.$events={}),this.$events[e]||(this.$events[e]=[]),t.util.isArray(this.$events[e])||(this.$events[e]=[this.$events[e]]),this.$events[e]},n.prototype.emit=function(e){if(!this.$events)return!1;var n=this.$events[e];if(!n)return!1;var r=Array.prototype.slice.call(arguments,1);if("function"==typeof n)n.apply(this,r);else{if(!t.util.isArray(n))return!1;for(var i=n.slice(),s=0,o=i.length;o>s;s++)i[s].apply(this,r)}return!0}}(io!==void 0?io:module.exports,io!==void 0?io:module.parent.exports),function(exports,nativeJSON){"use strict";function f(e){return 10>e?"0"+e:e}function date(e){return isFinite(e.valueOf())?e.getUTCFullYear()+"-"+f(e.getUTCMonth()+1)+"-"+f(e.getUTCDate())+"T"+f(e.getUTCHours())+":"+f(e.getUTCMinutes())+":"+f(e.getUTCSeconds())+"Z":null}function quote(e){return escapable.lastIndex=0,escapable.test(e)?'"'+e.replace(escapable,function(e){var t=meta[e];return"string"==typeof t?t:"\\u"+("0000"+e.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+e+'"'}function str(e,t){var n,r,i,s,o,u=gap,a=t[e];switch(a instanceof Date&&(a=date(e)),"function"==typeof rep&&(a=rep.call(t,e,a)),typeof a){case"string":return quote(a);case"number":return isFinite(a)?a+"":"null";case"boolean":case"null":return a+"";case"object":if(!a)return"null";if(gap+=indent,o=[],"[object Array]"===Object.prototype.toString.apply(a)){for(s=a.length,n=0;s>n;n+=1)o[n]=str(n,a)||"null";return i=0===o.length?"[]":gap?"[\n"+gap+o.join(",\n"+gap)+"\n"+u+"]":"["+o.join(",")+"]",gap=u,i}if(rep&&"object"==typeof rep)for(s=rep.length,n=0;s>n;n+=1)"string"==typeof rep[n]&&(r=rep[n],i=str(r,a),i&&o.push(quote(r)+(gap?": ":":")+i));else for(r in a)Object.prototype.hasOwnProperty.call(a,r)&&(i=str(r,a),i&&o.push(quote(r)+(gap?": ":":")+i));return i=0===o.length?"{}":gap?"{\n"+gap+o.join(",\n"+gap)+"\n"+u+"}":"{"+o.join(",")+"}",gap=u,i}}if(nativeJSON&&nativeJSON.parse)return exports.JSON={parse:nativeJSON.parse,stringify:nativeJSON.stringify};var JSON=exports.JSON={},cx=/[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,escapable=/[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,gap,indent,meta={"\b":"\\b","   ":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},rep;JSON.stringify=function(e,t,n){var r;if(gap="",indent="","number"==typeof n)for(r=0;n>r;r+=1)indent+=" ";else"string"==typeof n&&(indent=n);if(rep=t,t&&"function"!=typeof t&&("object"!=typeof t||"number"!=typeof t.length))throw Error("JSON.stringify");return str("",{"":e})},JSON.parse=function(text,reviver){function walk(e,t){var n,r,i=e[t];if(i&&"object"==typeof i)for(n in i)Object.prototype.hasOwnProperty.call(i,n)&&(r=walk(i,n),void 0!==r?i[n]=r:delete i[n]);return reviver.call(e,t,i)}var j;if(text+="",cx.lastIndex=0,cx.test(text)&&(text=text.replace(cx,function(e){return"\\u"+("0000"+e.charCodeAt(0).toString(16)).slice(-4)})),/^[\],:{}\s]*$/.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,"@").replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,"]").replace(/(?:^|:|,)(?:\s*\[)+/g,"")))return j=eval("("+text+")"),"function"==typeof reviver?walk({"":j},""):j;throw new SyntaxError("JSON.parse")}}(io!==void 0?io:module.exports,"undefined"!=typeof JSON?JSON:void 0),function(e,t){var n=e.parser={},r=n.packets=["disconnect","connect","heartbeat","message","json","event","ack","error","noop"],i=n.reasons=["transport not supported","client not handshaken","unauthorized"],s=n.advice=["reconnect"],o=t.JSON,u=t.util.indexOf;n.encodePacket=function(e){var t=u(r,e.type),n=e.id||"",a=e.endpoint||"",f=e.ack,l=null;switch(e.type){case"error":var c=e.reason?u(i,e.reason):"",h=e.advice?u(s,e.advice):"";(""!==c||""!==h)&&(l=c+(""!==h?"+"+h:""));break;case"message":""!==e.data&&(l=e.data);break;case"event":var p={name:e.name};e.args&&e.args.length&&(p.args=e.args),l=o.stringify(p);break;case"json":l=o.stringify(e.data);break;case"connect":e.qs&&(l=e.qs);break;case"ack":l=e.ackId+(e.args&&e.args.length?"+"+o.stringify(e.args):"")}var d=[t,n+("data"==f?"+":""),a];return null!==l&&void 0!==l&&d.push(l),d.join(":")},n.encodePayload=function(e){var t="";if(1==e.length)return e[0];for(var n=0,r=e.length;r>n;n++){var i=e[n];t+="�"+i.length+"�"+e[n]}return t};var a=/([^:]+):([0-9]+)?(\+)?:([^:]+)?:?([\s\S]*)?/;n.decodePacket=function(e){var t=e.match(a);if(!t)return{};var n=t[2]||"",e=t[5]||"",u={type:r[t[1]],endpoint:t[4]||""};switch(n&&(u.id=n,u.ack=t[3]?"data":!0),u.type){case"error":var t=e.split("+");u.reason=i[t[0]]||"",u.advice=s[t[1]]||"";break;case"message":u.data=e||"";break;case"event":try{var f=o.parse(e);u.name=f.name,u.args=f.args}catch(l){}u.args=u.args||[];break;case"json":try{u.data=o.parse(e)}catch(l){}break;case"connect":u.qs=e||"";break;case"ack":var t=e.match(/^([0-9]+)(\+)?(.*)/);if(t&&(u.ackId=t[1],u.args=[],t[3]))try{u.args=t[3]?o.parse(t[3]):[]}catch(l){}break;case"disconnect":case"heartbeat":}return u},n.decodePayload=function(e){if("�"==e.charAt(0)){for(var t=[],r=1,i="";e.length>r;r++)"�"==e.charAt(r)?(t.push(n.decodePacket(e.substr(r+1).substr(0,i))),r+=Number(i)+1,i=""):i+=e.charAt(r);return t}return[n.decodePacket(e)]}}(io!==void 0?io:module.exports,io!==void 0?io:module.parent.exports),function(e,t){function n(e,t){this.socket=e,this.sessid=t}e.Transport=n,t.util.mixin(n,t.EventEmitter),n.prototype.heartbeats=function(){return!0},n.prototype.onData=function(e){if(this.clearCloseTimeout(),(this.socket.connected||this.socket.connecting||this.socket.reconnecting)&&this.setCloseTimeout(),""!==e){var n=t.parser.decodePayload(e);if(n&&n.length)for(var r=0,i=n.length;i>r;r++)this.onPacket(n[r])}return this},n.prototype.onPacket=function(e){return this.socket.setHeartbeatTimeout(),"heartbeat"==e.type?this.onHeartbeat():("connect"==e.type&&""==e.endpoint&&this.onConnect(),"error"==e.type&&"reconnect"==e.advice&&(this.isOpen=!1),this.socket.onPacket(e),this)},n.prototype.setCloseTimeout=function(){if(!this.closeTimeout){var e=this;this.closeTimeout=setTimeout(function(){e.onDisconnect()},this.socket.closeTimeout)}},n.prototype.onDisconnect=function(){return this.isOpen&&this.close(),this.clearTimeouts(),this.socket.onDisconnect(),this},n.prototype.onConnect=function(){return this.socket.onConnect(),this},n.prototype.clearCloseTimeout=function(){this.closeTimeout&&(clearTimeout(this.closeTimeout),this.closeTimeout=null)},n.prototype.clearTimeouts=function(){this.clearCloseTimeout(),this.reopenTimeout&&clearTimeout(this.reopenTimeout)},n.prototype.packet=function(e){this.send(t.parser.encodePacket(e))},n.prototype.onHeartbeat=function(){this.packet({type:"heartbeat"})},n.prototype.onOpen=function(){this.isOpen=!0,this.clearCloseTimeout(),this.socket.onOpen()},n.prototype.onClose=function(){this.isOpen=!1,this.socket.onClose(),this.onDisconnect()},n.prototype.prepareUrl=function(){var e=this.socket.options;return this.scheme()+"://"+e.host+":"+e.port+"/"+e.resource+"/"+t.protocol+"/"+this.name+"/"+this.sessid},n.prototype.ready=function(e,t){t.call(this)}}(io!==void 0?io:module.exports,io!==void 0?io:module.parent.exports),function(e,t,n){function r(e){if(this.options={port:80,secure:!1,document:"document"in n?document:!1,resource:"socket.io",transports:t.transports,"connect timeout":1e4,"try multiple transports":!0,reconnect:!0,"reconnection delay":500,"reconnection limit":1/0,"reopen delay":3e3,"max reconnection attempts":10,"sync disconnect on unload":!1,"auto connect":!0,"flash policy port":10843,manualFlush:!1},t.util.merge(this.options,e),this.connected=!1,this.open=!1,this.connecting=!1,this.reconnecting=!1,this.namespaces={},this.buffer=[],this.doBuffer=!1,this.options["sync disconnect on unload"]&&(!this.isXDomain()||t.util.ua.hasCORS)){var r=this;t.util.on(n,"beforeunload",function(){r.disconnectSync()},!1)}this.options["auto connect"]&&this.connect()}function i(){}e.Socket=r,t.util.mixin(r,t.EventEmitter),r.prototype.of=function(e){return this.namespaces[e]||(this.namespaces[e]=new t.SocketNamespace(this,e),""!==e&&this.namespaces[e].packet({type:"connect"})),this.namespaces[e]},r.prototype.publish=function(){this.emit.apply(this,arguments);var e;for(var t in this.namespaces)this.namespaces.hasOwnProperty(t)&&(e=this.of(t),e.$emit.apply(e,arguments))},r.prototype.handshake=function(e){function n(t){t instanceof Error?(r.connecting=!1,r.onError(t.message)):e.apply(null,t.split(":"))}var r=this,s=this.options,o=["http"+(s.secure?"s":"")+":/",s.host+":"+s.port,s.resource,t.protocol,t.util.query(this.options.query,"t="+ +(new Date))].join("/");if(this.isXDomain()&&!t.util.ua.hasCORS){var u=document.getElementsByTagName("script")[0],a=document.createElement("script");a.src=o+"&jsonp="+t.j.length,u.parentNode.insertBefore(a,u),t.j.push(function(e){n(e),a.parentNode.removeChild(a)})}else{var f=t.util.request();f.open("GET",o,!0),this.isXDomain()&&(f.withCredentials=!0),f.onreadystatechange=function(){4==f.readyState&&(f.onreadystatechange=i,200==f.status?n(f.responseText):403==f.status?r.onError(f.responseText):(r.connecting=!1,!r.reconnecting&&r.onError(f.responseText)))},f.send(null)}},r.prototype.getTransport=function(e){for(var n,r=e||this.transports,i=0;n=r[i];i++)if(t.Transport[n]&&t.Transport[n].check(this)&&(!this.isXDomain()||t.Transport[n].xdomainCheck(this)))return new t.Transport[n](this,this.sessionid);return null},r.prototype.connect=function(e){if(this.connecting)return this;var n=this;return n.connecting=!0,this.handshake(function(r,i,s,o){function u(e){return n.transport&&n.transport.clearTimeouts(),n.transport=n.getTransport(e),n.transport?(n.transport.ready(n,function(){n.connecting=!0,n.publish("connecting",n.transport.name),n.transport.open(),n.options["connect timeout"]&&(n.connectTimeoutTimer=setTimeout(function(){if(!n.connected&&(n.connecting=!1,n.options["try multiple transports"])){for(var e=n.transports;e.length>0&&e.splice(0,1)[0]!=n.transport.name;);e.length?u(e):n.publish("connect_failed")}},n.options["connect timeout"]))}),void 0):n.publish("connect_failed")}n.sessionid=r,n.closeTimeout=1e3*s,n.heartbeatTimeout=1e3*i,n.transports||(n.transports=n.origTransports=o?t.util.intersect(o.split(","),n.options.transports):n.options.transports),n.setHeartbeatTimeout(),u(n.transports),n.once("connect",function(){clearTimeout(n.connectTimeoutTimer),e&&"function"==typeof e&&e()})}),this},r.prototype.setHeartbeatTimeout=function(){if(clearTimeout(this.heartbeatTimeoutTimer),!this.transport||this.transport.heartbeats()){var e=this;this.heartbeatTimeoutTimer=setTimeout(function(){e.transport.onClose()},this.heartbeatTimeout)}},r.prototype.packet=function(e){return this.connected&&!this.doBuffer?this.transport.packet(e):this.buffer.push(e),this},r.prototype.setBuffer=function(e){this.doBuffer=e,!e&&this.connected&&this.buffer.length&&(this.options.manualFlush||this.flushBuffer())},r.prototype.flushBuffer=function(){this.transport.payload(this.buffer),this.buffer=[]},r.prototype.disconnect=function(){return(this.connected||this.connecting)&&(this.open&&this.of("").packet({type:"disconnect"}),this.onDisconnect("booted")),this},r.prototype.disconnectSync=function(){var e=t.util.request(),n=["http"+(this.options.secure?"s":"")+":/",this.options.host+":"+this.options.port,this.options.resource,t.protocol,"",this.sessionid].join("/")+"/?disconnect=1";e.open("GET",n,!1),e.send(null),this.onDisconnect("booted")},r.prototype.isXDomain=function(){var e=n.location.port||("https:"==n.location.protocol?443:80);return this.options.host!==n.location.hostname||this.options.port!=e},r.prototype.onConnect=function(){this.connected||(this.connected=!0,this.connecting=!1,this.doBuffer||this.setBuffer(!1),this.emit("connect"))},r.prototype.onOpen=function(){this.open=!0},r.prototype.onClose=function(){this.open=!1,clearTimeout(this.heartbeatTimeoutTimer)},r.prototype.onPacket=function(e){this.of(e.endpoint).onPacket(e)},r.prototype.onError=function(e){e&&e.advice&&"reconnect"===e.advice&&(this.connected||this.connecting)&&(this.disconnect(),this.options.reconnect&&this.reconnect()),this.publish("error",e&&e.reason?e.reason:e)},r.prototype.onDisconnect=function(e){var t=this.connected,n=this.connecting;this.connected=!1,this.connecting=!1,this.open=!1,(t||n)&&(this.transport.close(),this.transport.clearTimeouts(),t&&(this.publish("disconnect",e),"booted"!=e&&this.options.reconnect&&!this.reconnecting&&this.reconnect()))},r.prototype.reconnect=function(){function e(){if(n.connected){for(var e in n.namespaces)n.namespaces.hasOwnProperty(e)&&""!==e&&n.namespaces[e].packet({type:"connect"});n.publish("reconnect",n.transport.name,n.reconnectionAttempts)}clearTimeout(n.reconnectionTimer),n.removeListener("connect_failed",t),n.removeListener("connect",t),n.reconnecting=!1,delete n.reconnectionAttempts,delete n.reconnectionDelay,delete n.reconnectionTimer,delete n.redoTransports,n.options["try multiple transports"]=i}function t(){return n.reconnecting?n.connected?e():n.connecting&&n.reconnecting?n.reconnectionTimer=setTimeout(t,1e3):(n.reconnectionAttempts++>=r?n.redoTransports?(n.publish("reconnect_failed"),e()):(n.on("connect_failed",t),n.options["try multiple transports"]=!0,n.transports=n.origTransports,n.transport=n.getTransport(),n.redoTransports=!0,n.connect()):(s>n.reconnectionDelay&&(n.reconnectionDelay*=2),n.connect(),n.publish("reconnecting",n.reconnectionDelay,n.reconnectionAttempts),n.reconnectionTimer=setTimeout(t,n.reconnectionDelay)),void 0):void 0}this.reconnecting=!0,this.reconnectionAttempts=0,this.reconnectionDelay=this.options["reconnection delay"];var n=this,r=this.options["max reconnection attempts"],i=this.options["try multiple transports"],s=this.options["reconnection limit"];this.options["try multiple transports"]=!1,this.reconnectionTimer=setTimeout(t,this.reconnectionDelay),this.on("connect",t)}}(io!==void 0?io:module.exports,io!==void 0?io:module.parent.exports,this),function(e,t){function n(e,t){this.socket=e,this.name=t||"",this.flags={},this.json=new r(this,"json"),this.ackPackets=0,this.acks={}}function r(e,t){this.namespace=e,this.name=t}e.SocketNamespace=n,t.util.mixin(n,t.EventEmitter),n.prototype.$emit=t.EventEmitter.prototype.emit,n.prototype.of=function(){return this.socket.of.apply(this.socket,arguments)},n.prototype.packet=function(e){return e.endpoint=this.name,this.socket.packet(e),this.flags={},this},n.prototype.send=function(e,t){var n={type:this.flags.json?"json":"message",data:e};return"function"==typeof t&&(n.id=++this.ackPackets,n.ack=!0,this.acks[n.id]=t),this.packet(n)},n.prototype.emit=function(e){var t=Array.prototype.slice.call(arguments,1),n=t[t.length-1],r={type:"event",name:e};return"function"==typeof n&&(r.id=++this.ackPackets,r.ack="data",this.acks[r.id]=n,t=t.slice(0,t.length-1)),r.args=t,this.packet(r)},n.prototype.disconnect=function(){return""===this.name?this.socket.disconnect():(this.packet({type:"disconnect"}),this.$emit("disconnect")),this},n.prototype.onPacket=function(e){function n(){r.packet({type:"ack",args:t.util.toArray(arguments),ackId:e.id})}var r=this;switch(e.type){case"connect":this.$emit("connect");break;case"disconnect":""===this.name?this.socket.onDisconnect(e.reason||"booted"):this.$emit("disconnect",e.reason);break;case"message":case"json":var i=["message",e.data];"data"==e.ack?i.push(n):e.ack&&this.packet({type:"ack",ackId:e.id}),this.$emit.apply(this,i);break;case"event":var i=[e.name].concat(e.args);"data"==e.ack&&i.push(n),this.$emit.apply(this,i);break;case"ack":this.acks[e.ackId]&&(this.acks[e.ackId].apply(this,e.args),delete this.acks[e.ackId]);break;case"error":e.advice?this.socket.onError(e):"unauthorized"==e.reason?this.$emit("connect_failed",e.reason):this.$emit("error",e.reason)}},r.prototype.send=function(){this.namespace.flags[this.name]=!0,this.namespace.send.apply(this.namespace,arguments)},r.prototype.emit=function(){this.namespace.flags[this.name]=!0,this.namespace.emit.apply(this.namespace,arguments)}}(io!==void 0?io:module.exports,io!==void 0?io:module.parent.exports),function(e,t,n){function r(){t.Transport.apply(this,arguments)}e.websocket=r,t.util.inherit(r,t.Transport),r.prototype.name="websocket",r.prototype.open=function(){var e,r=t.util.query(this.socket.options.query),i=this;return e||(e=n.MozWebSocket||n.WebSocket),this.websocket=new e(this.prepareUrl()+r),this.websocket.onopen=function(){i.onOpen(),i.socket.setBuffer(!1)},this.websocket.onmessage=function(e){i.onData(e.data)},this.websocket.onclose=function(){i.onClose(),i.socket.setBuffer(!0)},this.websocket.onerror=function(e){i.onError(e)},this},r.prototype.send=t.util.ua.iDevice?function(e){var t=this;return setTimeout(function(){t.websocket.send(e)},0),this}:function(e){return this.websocket.send(e),this},r.prototype.payload=function(e){for(var t=0,n=e.length;n>t;t++)this.packet(e[t]);return this},r.prototype.close=function(){return this.websocket.close(),this},r.prototype.onError=function(e){this.socket.onError(e)},r.prototype.scheme=function(){return this.socket.options.secure?"wss":"ws"},r.check=function(){return"WebSocket"in n&&!("__addTask"in WebSocket)||"MozWebSocket"in n},r.xdomainCheck=function(){return!0},t.transports.push("websocket")}(io!==void 0?io.Transport:module.exports,io!==void 0?io:module.parent.exports,this),function(e,t,n){function r(e){e&&(t.Transport.apply(this,arguments),this.sendBuffer=[])}function i(){}e.XHR=r,t.util.inherit(r,t.Transport),r.prototype.open=function(){return this.socket.setBuffer(!1),this.onOpen(),this.get(),this.setCloseTimeout(),this},r.prototype.payload=function(e){for(var n=[],r=0,i=e.length;i>r;r++)n.push(t.parser.encodePacket(e[r]));this.send(t.parser.encodePayload(n))},r.prototype.send=function(e){return this.post(e),this},r.prototype.post=function(e){function t(){4==this.readyState&&(this.onreadystatechange=i,s.posting=!1,200==this.status?s.socket.setBuffer(!1):s.onClose())}function r(){this.onload=i,s.socket.setBuffer(!1)}var s=this;this.socket.setBuffer(!0),this.sendXHR=this.request("POST"),n.XDomainRequest&&this.sendXHR instanceof XDomainRequest?this.sendXHR.onload=this.sendXHR.onerror=r:this.sendXHR.onreadystatechange=t,this.sendXHR.send(e)},r.prototype.close=function(){return this.onClose(),this},r.prototype.request=function(e){var n=t.util.request(this.socket.isXDomain()),r=t.util.query(this.socket.options.query,"t="+ +(new Date));if(n.open(e||"GET",this.prepareUrl()+r,!0),"POST"==e)try{n.setRequestHeader?n.setRequestHeader("Content-type","text/plain;charset=UTF-8"):n.contentType="text/plain"}catch(i){}return n},r.prototype.scheme=function(){return this.socket.options.secure?"https":"http"},r.check=function(e,r){try{var i=t.util.request(r),s=n.XDomainRequest&&i instanceof XDomainRequest,o=e&&e.options&&e.options.secure?"https:":"http:",u=n.location&&o!=n.location.protocol;if(i&&(!s||!u))return!0}catch(a){}return!1},r.xdomainCheck=function(e){return r.check(e,!0)}}(io!==void 0?io.Transport:module.exports,io!==void 0?io:module.parent.exports,this),function(e,t){function n(){t.Transport.XHR.apply(this,arguments)}e.htmlfile=n,t.util.inherit(n,t.Transport.XHR),n.prototype.name="htmlfile",n.prototype.get=function(){this.doc=new(window[["Active"].concat("Object").join("X")])("htmlfile"),this.doc.open(),this.doc.write("<html></html>"),this.doc.close(),this.doc.parentWindow.s=this;var e=this.doc.createElement("div");e.className="socketio",this.doc.body.appendChild(e),this.iframe=this.doc.createElement("iframe"),e.appendChild(this.iframe);var n=this,r=t.util.query(this.socket.options.query,"t="+ +(new Date));this.iframe.src=this.prepareUrl()+r,t.util.on(window,"unload",function(){n.destroy()})},n.prototype._=function(e,t){this.onData(e);try{var n=t.getElementsByTagName("script")[0];n.parentNode.removeChild(n)}catch(r){}},n.prototype.destroy=function(){if(this.iframe){try{this.iframe.src="about:blank"}catch(e){}this.doc=null,this.iframe.parentNode.removeChild(this.iframe),this.iframe=null,CollectGarbage()}},n.prototype.close=function(){return this.destroy(),t.Transport.XHR.prototype.close.call(this)},n.check=function(e){if("undefined"!=typeof window&&["Active"].concat("Object").join("X")in window)try{var n=new(window[["Active"].concat("Object").join("X")])("htmlfile");return n&&t.Transport.XHR.check(e)}catch(r){}return!1},n.xdomainCheck=function(){return!1},t.transports.push("htmlfile")}(io!==void 0?io.Transport:module.exports,io!==void 0?io:module.parent.exports),function(e,t,n){function r(){t.Transport.XHR.apply(this,arguments)}function i(){}e["xhr-polling"]=r,t.util.inherit(r,t.Transport.XHR),t.util.merge(r,t.Transport.XHR),r.prototype.name="xhr-polling",r.prototype.heartbeats=function(){return!1},r.prototype.open=function(){var e=this;return t.Transport.XHR.prototype.open.call(e),!1},r.prototype.get=function(){function e(){4==this.readyState&&(this.onreadystatechange=i,200==this.status?(s.onData(this.responseText),s.get()):s.onClose())}function t(){this.onload=i,this.onerror=i,s.retryCounter=1,s.onData(this.responseText),s.get()}function r(){s.retryCounter++,!s.retryCounter||s.retryCounter>3?s.onClose():s.get()}if(this.isOpen){var s=this;this.xhr=this.request(),n.XDomainRequest&&this.xhr instanceof XDomainRequest?(this.xhr.onload=t,this.xhr.onerror=r):this.xhr.onreadystatechange=e,this.xhr.send(null)}},r.prototype.onClose=function(){if(t.Transport.XHR.prototype.onClose.call(this),this.xhr){this.xhr.onreadystatechange=this.xhr.onload=this.xhr.onerror=i;try{this.xhr.abort()}catch(e){}this.xhr=null}},r.prototype.ready=function(e,n){var r=this;t.util.defer(function(){n.call(r)})},t.transports.push("xhr-polling")}(io!==void 0?io.Transport:module.exports,io!==void 0?io:module.parent.exports,this),function(e,t,n){function r(){t.Transport["xhr-polling"].apply(this,arguments),this.index=t.j.length;var e=this;t.j.push(function(t){e._(t)})}var i=n.document&&"MozAppearance"in n.document.documentElement.style;e["jsonp-polling"]=r,t.util.inherit(r,t.Transport["xhr-polling"]),r.prototype.name="jsonp-polling",r.prototype.post=function(e){function n(){r(),i.socket.setBuffer(!1)}function r(){i.iframe&&i.form.removeChild(i.iframe);try{o=document.createElement('<iframe name="'+i.iframeId+'">')}catch(e){o=document.createElement("iframe"),o.name=i.iframeId}o.id=i.iframeId,i.form.appendChild(o),i.iframe=o}var i=this,s=t.util.query(this.socket.options.query,"t="+ +(new Date)+"&i="+this.index);if(!this.form){var o,u=document.createElement("form"),a=document.createElement("textarea"),f=this.iframeId="socketio_iframe_"+this.index;u.className="socketio",u.style.position="absolute",u.style.top="0px",u.style.left="0px",u.style.display="none",u.target=f,u.method="POST",u.setAttribute("accept-charset","utf-8"),a.name="d",u.appendChild(a),document.body.appendChild(u),this.form=u,this.area=a}this.form.action=this.prepareUrl()+s,r(),this.area.value=t.JSON.stringify(e);try{this.form.submit()}catch(l){}this.iframe.attachEvent?o.onreadystatechange=function(){"complete"==i.iframe.readyState&&n()}:this.iframe.onload=n,this.socket.setBuffer(!0)},r.prototype.get=function(){var e=this,n=document.createElement("script"),r=t.util.query(this.socket.options.query,"t="+ +(new Date)+"&i="+this.index);this.script&&(this.script.parentNode.removeChild(this.script),this.script=null),n.async=!0,n.src=this.prepareUrl()+r,n.onerror=function(){e.onClose()};var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(n,s),this.script=n,i&&setTimeout(function(){var e=document.createElement("iframe");document.body.appendChild(e),document.body.removeChild(e)},100)},r.prototype._=function(e){return this.onData(e),this.isOpen&&this.get(),this},r.prototype.ready=function(e,n){var r=this;return i?(t.util.load(function(){n.call(r)}),void 0):n.call(this)},r.check=function(){return"document"in n},r.xdomainCheck=function(){return!0},t.transports.push("jsonp-polling")}(io!==void 0?io.Transport:module.exports,io!==void 0?io:module.parent.exports,this),"function"==typeof define&&define.amd&&define([],function(){return io})})()