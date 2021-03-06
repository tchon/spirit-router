/*
 * spec for how spirit-router works
 */

const route = require("../index")

describe("router-spec", () => {

  it("it is a spirit handler, takes a request, returns a Promise of a response map", (done) => {
    const r = route.define([
      ["get", "/", [], "home"]
    ])
    const result = r({ method: "GET", url: "/"})
    result.then((response) => {
      expect(response).toEqual(jasmine.objectContaining({
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8"
        },
        body: "home"
      }))
      done()
    })
  })

  it("routes based on request map's url and method", (done) => {
    const r = route.define([
      ["get", "/", [], "get home"],
      ["post", "/", [], "post home"],
      ["post", "/a", [], "post a"],
      ["get", "/a", [], "get a"]
    ])

    const result = r({ method: "POST", url: "/a" })
    result.then((resp) => {
      expect(resp).toEqual(jasmine.objectContaining({
        status: 200,
        body: "post a"
      }))
      done()
    })
  })

  it("can compose by nesting itself", (done) => {
    const rrr = route.define([
      ["get", "/", [], "home"]
    ])
    const rr = route.define([ rrr ])
    const r = route.define([ rr ])

    const result = r({ method: "GET", url: "/" })
    result.then((resp) => {
      expect(resp).toEqual(jasmine.objectContaining({
        status: 200,
        body: "home"
      }))
      done()
    })
  })

  it("stops routing after it gets a response", (done) => {
    const r = route.define([
      ["GET", "/", [], "ok"],
      ["GET", "/", [], "oops"]
    ])

    const result = r({ method: "GET", url: "/" })
    result.then((resp) => {
      expect(resp.body).toBe("ok")
      done()
    })
  })

  it("can specify a prefix used for routing (with define)", (done) => {
    const route_b = route.define("/b", [
      ["GET", "/b", [], "b"]
    ])
    const route_a = route.define("/a", [
      ["GET", "/a", [], "a"]
    ])

    const result = route_a({ method: "GET", url: "/a/a" })
    result.then((resp) => {
      expect(resp.body).toBe("a")
      return route_b({ method: "GET", url: "/b/b" })
    }).then((resp) => {
      expect(resp.body).toBe("b")
      done()
    })
  })

  it("the prefix when nested will carry over", (done) => {
    const route_b = route.define("/b", [
      ["GET", "/b", [], "b"]
    ])
    const route_a = route.define("/a", [
      ["GET", "/a", [], "a"],
      route_b
    ])

    const result = route_a({ method: "GET", url: "/a/b/b" })
    result.then((resp) => {
      expect(resp.body).toBe("b")
      done()
    })
  })

  it("does dep injection by destructuring the input (request) for routes", (done) => {
    const test = (arg) => {
      expect(arg).toBe("/a/a")
      return arg
    }
    const r = route.define("/a", [
      ["GET", "/a", ["url"], test]
    ])

    const result = r({ method: "GET", url: "/a/a" })
    result.then((resp) => {
      expect(resp.body).toBe("/a/a")
      done()
    })
  })

  it("can 'pass' on a route by returning undefined, moving to the next route that matches", (done) => {
    const test = () => {}
    const hi = () => { return "hi" }

    const r = route.define([
      ["GET", "/a", [], test],
      ["GET", "/a", [], test],
      ["GET", "/a", [], hi],
      ["GET", "/a", [], "no"]
    ])

    const result = r({ method: "GET", url: "/a" })
    result.then((resp) => {
      expect(resp.body).toBe("hi")
      done()
    })
  })

  it("converts return values of a Route or a Routes function to be a promise response map", (done) => {
    const test = () => {
      return "hello world"
    }
    const r = route.define([
      ["GET", "/", [], test],
      ["GET", "/string", [], "hello world!"]
    ])

    const result = r({ method: "GET", url: "/" })
    result.then((resp) => {
      expect(resp).toEqual(jasmine.objectContaining({
        status: 200,
        body: "hello world"
      }))
      return r({ method: "GET", url: "/string" })
    }).then((resp) => {
      expect(resp).toEqual(jasmine.objectContaining({
        status: 200,
        body: "hello world!"
      }))
      done()
    })
  })

  it("'params' does not leak into other routes", (done) => {
    const test = (arg) => {
      expect(arg).toBe("test")
    }
    const test2 = (arg) => {
      expect(arg).toBe("/test")
      return arg
    }
    const r = route.define([
      ["get", "/:url", ["url"], test],
      ["get", "/test", ["url"], test2]
    ])

    const result = r({ method: "GET", url: "/test" })
    result.then((resp) => {
      done()
    })
  })

  it("can wrap spirit middleware with a Route", (done) => {
    const test = (called) => {
      expect(called).toBe("21")
      return "123"
    }

    const middleware = [
      (handler) => {
        return (request) => {
          request.called += "2"
          return handler(request).then((resp) => {
            expect(resp.body).toBe("123b")
            resp.body += "a"
            return resp
          })
        }
      },
      (handler) => {
        return (request) => {
          request.called += "1"
          return handler(request).then((resp) => {
            resp.body += "b"
            return resp
          })
        }
      }
    ]

    const r = route.define([
      route.wrap(["GET", "/", ["called"], test], middleware)
    ])

    const result = r({ method: "GET", url: "/", called: "" })
    result.then((resp) => {
      expect(resp.body).toBe("123ba")
      done()
    })
  })

  it("can wrap the result of define with middleware", (done) => {
    const test = (called) => {
      expect(called).toBe("2121")
      return "123"
    }

    const middleware = [
      (handler) => {
        return (request) => {
          request.called += "2"
          return handler(request).then((resp) => {
            resp.body += "a"
            return resp
          })
        }
      },
      (handler) => {
        return (request) => {
          request.called += "1"
          return handler(request).then((resp) => {
            resp.body += "b"
            return resp
          })
        }
      }
    ]

    let r = route.define([
      route.wrap(["GET", "/", ["called"], test], middleware)
    ])

    const rr = route.wrap(r, middleware)
    const result = rr({ method: "GET", url: "/", called: "" })
    result.then((resp) => {
      expect(resp.body).toBe("123baba")
      done()
    })
  })

  it("routes with no body get routed (middleware gets called), but the route is considered a pass as the route's body is undefined", (done) => {
    const middleware = (handler) => {
      return (request) => {
        return handler(request).then((resp) => {
          expect(resp).toBe(undefined)
          return "ok"
        })
      }
    }
    let r = route.define([
      route.wrap(route.get("/"), middleware),
      route.get("/", [], "hello")
    ])

    r({ method: "GET", url: "/" }).then((resp) => {
      expect(resp).toBe("ok")

      // same test but without middleware
      r = route.define([
        route.get("/"),
        route.get("/", [], "hello")
      ])
      r({ method: "GET", url: "/" }).then((resp) => {
        expect(resp.body).toBe("hello")
        done()
      })
    })
  })

  it("wrapped route middleware can handle route errors", (done) => {
    const p = Promise.resolve("hi")

    const test = () => {
      return p.then(() => {
        throw "error"
      })
    }

    let app = route.define([
      route.get("/", test)
    ])

    const middleware = (handler) => {
      return (request) => {
        return handler(request).catch((err) => {
          expect(err).toBe("error")
          return "hello"
        })
      }
    }

    app = route.wrap(app, middleware)

    app({ method: "GET", url: "/" }).then((resp) => {
      expect(resp).toBe("hello")
      done()
    })
  })

  it("wrapped routes can compose by nesting itself too", (done) => {
    let called = 0

    const middleware = (handler) => {
      return (req) => {
        called += 1
        return handler(req).then((resp) => {
          if (!resp) return resp
          resp.body += "-"
          return resp
        })
      }
    }

    const rr1 = route.define("/testing", [
      route.wrap(["get", "/test1", [], undefined], middleware)
    ])
    const rr2 = route.define("/testing", [
      route.wrap(["get", "/test2", [], "home"], middleware)
    ])

    const r = route.define([
      route.wrap(rr1, middleware),
      route.wrap(rr2, middleware)
    ])

    const result = r({ method: "GET", url: "/testing/test2" })
    result.then((resp) => {
      expect(resp).toEqual(jasmine.objectContaining({
        status: 200,
        body: "home--"
      }))
      expect(called).toBe(3)
      done()
    })
  })

  it("resolves a route that returns a response body which is a promise (promise response map -> with promise body)", (done) => {
    const test = () => {
      const p = Promise.resolve("hi")
      return {
        status: 201,
        headers: { a: 123 },
        body: p
      }
    }

    const app = route.define([
      route.get("/", test)
    ])

    app({ method: "GET", url: "/" }).then((resp) => {
      expect(resp.status).toBe(201)
      expect(resp.headers.a).toBe(123)
      expect(resp.body).toBe("hi")
      done()
    })
  })

  // FIXME: spec triggers warnings related to async Promise catch
  // it is related to resolve_response
  it("resolves a route that returns a response body of a rejected promise", (done) => {
    const test = () => {
      const p = Promise.reject("err 1")
      return {
        status: 200,
        headers: {},
        body: p
      }
    }

    const app = route.define([
      route.get("/", test)
    ])

    app({ method: "GET", url: "/" }).catch((err) => {
      expect(err).toBe("err 1")
      done()
    })
  })

})
