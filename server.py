#!/usr/bin/env python
import os.path
import sys
import re

import txmongo
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
            xsrf_cookies=False,
            autoescape=None
        )
        
        mongo_uri = os.environ.get('MONGOLAB_URI', False)
        if mongo_uri:
            log.msg(mongo_uri)
            regex = re.compile("^(?P<scheme>.*):\/\/(?P<user>.*):(?P<password>.*)@(?P<host>.*):(?P<port>\d*)\/(?P<database>.*)$")
            creds = regex.search(mongo_uri).groupdict()
            log.msg(creds)
            mongo = txmongo.lazyMongoConnectionPool(host=creds['host'], port=creds['port'])
            db = mongo[creds['database']]
            db.auth(creds['user'], creds['password'])
        else:
            mongo = txmongo.lazyMongoConnectionPool()
            db = mongo['valldb']

        handlers = [
            (r"/(.*)/scripts.js", JSHandler),
            (r"/(.*)", VideowallHandler, dict(db=db)),
            (r"/static/(.*)", cyclone.web.StaticFileHandler,
                dict(path=settings['static_path'])),
        ]
        cyclone.web.Application.__init__(self, handlers, **settings)


class VideowallHandler(cyclone.web.RequestHandler):
    def initialize(self, db):
        self.db = db
    
    def get(self, name=None):
        if not name:
            self.render("index.html")
        self.render("videowall.html", **{"name": name})
        
    def post(self, name=None):
        name = self.get_argument('name')
        self.redirect("/{0}".format(name))

class JSHandler(cyclone.web.RequestHandler):
    def get(self, name):
        endpoint = "http://signal.vall.me:80"
        self.render("scripts.js", **{"name": name, "wsendpoint": endpoint})


def main():
    reactor.listenTCP(int(os.environ.get("PORT", 5555)), Application())
    reactor.run()


if __name__ == "__main__":
    log.startLogging(sys.stdout)
    main()
