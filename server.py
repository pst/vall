#!/usr/bin/env python
import os.path
import sys

import cyclone.escape
import cyclone.web
import cyclone.websocket
from twisted.python import log
from twisted.internet import reactor

class Vall(object):
    
    name = ''
    
    clients = []
    
    def __init__(self, name):
        self.name = name
        
    def client_connect(self, c):
        clients.append(c)
        
    def client_disconnect(self, c):
        del clients[c]

class Valls(object):
    
    valls = {}
    
    def create_vall(self, name):
        vall = Vall(name)
        self.valls[name] = vall

    def remove_vall(self, name):
        del self.valls[name]
         

class Application(cyclone.web.Application):
    def __init__(self):
        settings = dict(
            cookie_secret="2c-*JKf74*41pfgj8.J|0G\Iuv@H:!,x]%V",
            template_path=os.path.join(os.path.dirname(__file__), "templates"),
            static_path=os.path.join(os.path.dirname(__file__), "static"),
            xsrf_cookies=True,
            autoescape=None
        )
        
        valls = Valls()

        handlers = [
            (r"/", IndexHandler),
            (r"/socket.io/(.*)/(.*)/$", VallSocketHandler, dict(valls=valls)),
            (r"/socket.io/(.*)/$", VallHandler, dict(valls=valls)),
            (r"/js/scripts.js", JSHandler),
            (r"/static/(.*)", cyclone.web.StaticFileHandler,
                dict(path=settings['static_path'])),
        ]
        cyclone.web.Application.__init__(self, handlers, **settings)


class IndexHandler(cyclone.web.RequestHandler):
    def get(self):
        self.render("index.html")


class JSHandler(cyclone.web.RequestHandler):
    def get(self):
        endpoint = "10.100.255.82:{0}".format(5555)
        if os.environ.get("DEP_NAME", False):
            dep_name = os.environ.get("DEP_NAME")
            endpoint = "{0}.cloudcontrolapp.com".format(dep_name.split('/')[0])
        self.render("scripts.js", **{"wsendpoint": endpoint})


class VallHandler(cyclone.web.RequestHandler):
    
    def initialize(self, valls):
        self.valls = valls
    
    def get(self, name):
        log.msg("create channel {0}".format(name))
        if name in self.valls.valls:
            return
        self.valls.create_vall(name)
        
class VallSocketHandler(cyclone.websocket.WebSocketHandler):

    def initialize(self, valls):
        self.valls = valls
    
    def connectionMade(self, *args, **kwargs):
        vall = self.get_vall(self.request.path)
        if not vall:
            self.valls.create_vall(name)
            log.msg("created new room")
        log.msg("new client connected")
        valls[name].new_client(self)
        
    def connectionLost(self, reason):
        vall = self.get_vall(self.request.path)
        if vall:
            vall.client_disconnect(self)
            log.msg("client disconnected")
        if vall and len(vall.clients) == 0:
            self.valls.remove_vall(vall)
            log.msg("empty room removed")
            
    def messageReceived(self, message):
        vall = self.get_vall(self.request.path)
        if vall:
            for c in vall.clients:
                self.sendMessage(message)
                
    def get_vall(self, name):
        if name in self.valls.valls:
            return self.valls['name']
        return None
        

def main():
    reactor.listenTCP(int(os.environ.get("PORT", 5555)), Application())
    reactor.run()


if __name__ == "__main__":
    log.startLogging(sys.stdout)
    main()