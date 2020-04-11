'use strict'

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
    console.log(e)
    cb("Failed to complete. Please try again after some time.")
  }
}

function setupOptions(o) {
  if(typeof o === 'string') o = { type: o }
  let defaults = {
    method: 'POST',
    retry: [1,5,15,25],
    timeout: 14000,
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
      if(ndx >= opts.retry.length) return cb(err, res)
      if(err.noretry) return cb(err, res)
      console.error(err)
      let retryafter = opts.retry[ndx]
      if(ndx) retryafter -= opts.retry[ndx-1]
      console.log(`Retrying after ${retryafter} seconds...`)
      setTimeout(() => call_ndx_1(ndx+1), retryafter * 1000)
    })
  }
}

/*    outcome/
 * We get the location of the service for the given type and send an
 * AJAX request, handling timeouts or responses (whichever happens
 * first)
 */
function send_(opts, params, cb) {
  let url_ = getLocation(opts.type)
  if(!url_) {
    return cb({
      msg: `Error - no route to ${type} found`,
      noretry: true
    })
  }

  let called = false
  let xhr = new XMLHttpRequest()

  xhr.onreadystatechange = function() {
    if(xhr.readyState !== XMLHttpRequest.DONE) return
    if(called) return
    called = true
    handleResponse(xhr.status, xhr.responseText, cb)
  }

  xhr.ontimeout = function() {
    if(called) return
    called = true
    handleResponse(504, null, cb)
  }

  xhr.open(opts.method, url_)
  xhr.timeout = opts.timeout
  if(params) {
    opts.headers = Object.assign({
    "Content-Type": "application/json"
    }, opts.headers)
  }
  for(let k in opts.headers) {
    xhr.setRequestHeader(k, opts.headers[k])
  }
  if(params) {
    xhr.send(JSON.stringify(params))
  } else {
    xhr.send()
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
    console.error(resp.msg)
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

function getLocation(type) {
  let svr = `${window.location.protocol}//${window.location.host}`
  if(svr[svr.length-1] == '/') return `${svr}${type}`
  else return `${svr}/${type}`
}
