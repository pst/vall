#!/usr/bin/env python
import os.path
import sys

import cyclone.escape
import cyclone.web
import cyclone.websocket
from twisted.python import log
from twisted.internet import reactor


class Application(cyclone.web.Application):
    def __init__(self):
        settings = dict(
            cookie_secret="2c-*JKf74*41pfgj8.J|0G\Iuv@H:!,x]%V",
            template_path=os.path.join(os.path.dirname(__file__), "templates"),
            static_path=os.path.join(os.path.dirname(__file__), "static"),
            xsrf_cookies=True,
            autoescape=None
        )

        handlers = [
            (r"/", IndexHandler),
            (r"/echo", EchoSocketHandler),
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
        endpoint = "localhost:{0}".format(5555)
        if os.environ.get("DEP_NAME", False):
            dep_name = os.environ.get("DEP_NAME")
            endpoint = "{0}.cloudcontrolapp.com".format(dep_name.split('/')[0])
        self.render("scripts.js", **{"wsendpoint": endpoint})
        

class EchoSocketHandler(cyclone.websocket.WebSocketHandler):

    def connectionMade(self, *args, **kwargs):
        log.msg("ws opened")

    def connectionLost(self, reason):
        log.msg("ws closed")

    def messageReceived(self, message):
        log.msg("got message %s" % message)
        self.sendMessage(message)


def main():
    reactor.listenTCP(int(os.environ.get("PORT", 5555)), Application())
    reactor.run()


if __name__ == "__main__":
    log.startLogging(sys.stdout)
    main()