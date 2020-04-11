'use strict'
const url = require('url')
const http = require('http')

const pino = require('pino')
const logger = pino()

/*    outcome/
 * Call the given microservice type with the given parameters.
 * If type is an object use it to update the various parameters.
 */
function msx(type, params, cb) {
  if(typeof params == 'function') {
    cb = params
    params = null
  }
  let opts = setupOptions(type)

  try {
    reqret(opts, params, cb)
  } catch(e) {
    cb(e)
  }
}

function setupOptions(o) {
  if(typeof o === 'string') o = { type: o }
  let defaults = {
    method: 'POST',
    retry: [1,5,15,25],
    timeout: 1000,
    headers: null,
  }
  return Object.assign(defaults, o)
}

/*    outcome/
 * Request microservice and, if it fails, call it again on the given
 * retry schedule if provided.
 */
function reqret(opts, params, cb) {
  if(opts.retry && opts.retry.length) call_ndx_1(0)
  else send_(opts, params, cb)

  /*    outcome/
   * Call the function and return if success. If failure we retry using
   * the schedule unless requested not to. The difference between
   * current index and previous is the time till next try.
   */
  function call_ndx_1(ndx) {
    send_(opts, params, (err, res) => {
      if(!err) return cb(err, res)
      logger.error(err)
      if(ndx >= opts.retry.length) return cb(err, res)
      if(err.noretry) return cb(err, res)
      let retryafter = opts.retry[ndx]
      if(ndx) retryafter -= opts.retry[ndx-1]
      setTimeout(() => call_ndx_1(ndx+1), retryafter * 1000)
    })
  }
}

/*    outcome/
 * We get the location of the microservice type and send the request to
 * there , handling data and error and timeout events in a way that
 * calls our callback only once.
 */
function send_(opts, params, cb) {
  cb = callOnceOnly(cb)

  getLocation(opts.type, (err, url_) => {
    if(err) cb(err)
    else send_to_url_1(url_, cb)
  })

  function send_to_url_1(url_, cb) {
    if(!url_) {
      return cb({
        msg: `Error - no route to ${opts.type} found`,
        noretry: true
      })
    }

    let options = {
      hostname: url_.hostname,
      port: url_.port,
      path: '/' + opts.type,
      method: opts.method,
    }
    if(params) {
      params = JSON.stringify(params)
      options.headers =  {
        'Content-Type': 'application/json',
        'Content-Length': params.length,
      }
      if(opts.headers) {
        options.headers = Object.assign(options.headers, opts.headers)
      }
    }

    let req = http.request(options, gather_response_1)
    req.on('error', cb)
    req.setTimeout(opts.timeout, () => {
      cb({ timeout: true })
      req.abort()
    })
    if(params) req.write(params)
    req.end()
  }

  function gather_response_1(res) {
    let resp = ""
    res.setEncoding('utf8')
    res.on('data', d => resp += d)
    res.on('end', () => {
      handleResponse(res.statusCode, resp, cb)
    })
  }
}

/*    problem/
 * Nodejs HTTP module uses events to handle various cases. The problem
 * then becomes calling the callback correctly in all cases. For
 * example, we may want to call the callback on the 'close' event but in
 * some cases an error will occur and we don't want to call it then.
 * This came up especially because of the timeout case.
 *
 *    way/
 * We wrap the callback in another function that invokes it only once
 * irrespective of how many times it itself is called.
 */
function callOnceOnly(cb) {
  let called = false
  return (err, resp) => {
    if(called) return
    called = true
    cb(err, resp)
  }
}

/*    understand/
 * If the response status is:
 *  200: the response has succeeded
 *  500: the request has failed - but you can retry
 *  0: the connection has failed - you can retry
 *  (anything else): the request has failed - do not retry
 *
 *    outcome/
 * If we have a JSON response then return that, otherwise create a JSON
 * object with the response as a message field (if we don't have a
 * response at all use a default message).
 *
 * On errors we check the status and set the `noretry` field.
 * Additionally, if the error message looks like a HTML response (many
 * 404 errors are full HTML pages), we output it to the console and
 * simply return the default message.
 */
function handleResponse(status, resp, cb) {
  const defaultMsg = "Failed to complete. Please try again after some time."
  if(!resp) {
    resp = { msg : defaultMsg }
  } else {
    try {
      resp = JSON.parse(resp)
    } catch(e) {
      resp = { msg: resp }
    }
  }

  if(status == 200) return cb(null, resp)

  resp.status = status

  if(status !== 0 && status !== 500) resp.noretry = true

  if(is_html_1(resp.msg)) {
    logger.error(resp.msg)
    resp.msg = defaultMsg
  }

  return cb(resp)

  /*    outcome/
   * We check if there are a few fields that look like HTML and if there
   * are at least three we guess that it is a HTML file.
   */
  function is_html_1(msg) {
    msg = msg.toLowerCase()
    let numhits = 0
    if(msg.indexOf('<html') != -1) numhits++
    if(msg.indexOf('</html>') != -1) numhits++
    if(msg.indexOf('<head ') != -1) numhits++
    if(msg.indexOf('</head>') != -1) numhits++
    if(msg.indexOf('<body') != -1) numhits++
    if(msg.indexOf('</body>') != -1) numhits++
    if(msg.indexOf('<pre') != -1) numhits++
    if(msg.indexOf('</pre>') != -1) numhits++
    if(msg.indexOf('<span>') != -1) numhits++
    if(msg.indexOf('</span>') != -1) numhits++
    if(msg.indexOf('<div>') != -1) numhits++
    if(msg.indexOf('</div>') != -1) numhits++

    return numhits > 2
  }
}

let ROUTING_TABLE
let ROUTING_TABLE_URL = url.parse('http://localhost')

/*    outcome/
 * Use the routing table to get the location of the given service,
 * handling the special case of the `--routes` which fetches the table
 * itself. If we don't have a table we can't return a url so we make a
 * call to get it first.
 */
function getLocation(type, cb) {
  if(type == '--routes') return cb(null, ROUTING_TABLE_URL)

  if(ROUTING_TABLE) return cb(null, ROUTING_TABLE[type])

  getRoutingTable(err => {
    if(err) cb(err)
    else cb(null, ROUTING_TABLE[type])
  })
}

/*    outcome/
 * Make a request to the gateway and get the routing table
 */
function getRoutingTable(cb) {
  msx('--routes', (err, routes) => {
    if(err) cb(err)
    else {
      ROUTING_TABLE = {}
      for(let i = 0;i < routes.length;i++) {
        let route = routes[i]
        ROUTING_TABLE[route.type] = rt_1(route.port)
      }
      logger.info(`Fetched routing table`)
      cb()
    }
  })

  function rt_1(port) {
    return url.parse('http://localhost:' + port)
  }
}

getRoutingTable(err => {
  if(err) logger.error(err)
})

module.exports = msx
