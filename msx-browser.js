'use strict'

/*    understand/
 * By default we retry the request couple of time - once after a second
 * and once after 5, then after 15, and 25 seconds. This makes the
 * request slower but more stable.
 *
 *    problem/
 * The retry must be done only when the request originates from the
 * calling service and not when it is part of a chain otherwise we will
 * get multiple requests for the same action.
 *
 *    For example:
 *
 *   register user ---> save user ---> send mail
 *                (should       (should
 *                retry)        NOT retry)
 *
 * If the second microservice retries before returning then the first
 * will timeout anyway and send multiple requests to register the same
 * user.
 *
 *    way/
 * We send the request with a standard retry schedule unless the user
 * has specified 'once:type' as the type.
 *
 *    For example:
 *    msx('mailer', { to: ... }, cb) will retry
 *    msx('once:mailer', { to: ... }, cb) will only send once before
 *    failing.
 */
function msx(type, params, cb) {
  if(typeof params == 'function') {
    cb = params
    params = null
  }

  try {
    if(can_retry_1(type)) retry([1,5,15,25], type, params, cb)
    else send_(strip_1(type), params, cb)
  } catch(e) {
    console.log(e)
    cb("Failed to complete. Please try again after some time.")
  }

  function can_retry_1(type) {
    return !type.startsWith('once:')
  }

  function strip_1(type) {
    return type.substring('once:'.length)
  }
}

/*    outcome/
 * Call the function and, if it fails, call it again on the given
 * schedule.
 */
function retry(schedule, type, params, cb) {
  if(typeof params == 'function') {
    cb = params
    params = null
  }

  call_ndx_1(0)

  /*    outcome/
   * Call the function and return if success. If failure we retry using
   * the schedule unless requested not to. The difference between
   * current index and previous is the time till next try.
   */
  function call_ndx_1(ndx) {
    send_(type, params, (err, res) => {
      if(!err) return cb(err, res)
      if(ndx >= schedule.length) return cb(err, res)
      if(err.noretry) return cb(err, res)
      let retryafter = schedule[ndx]
      if(ndx) retryafter -= schedule[ndx-1]
      setTimeout(() => call_ndx_1(ndx+1), retryafter * 1000)
    })
  }
}

/*    outcome/
 * We get the location of the service for the given type and send an
 * AJAX request, handling redirects when requested.
 */
function send_(type, params, cb) {
  let url_ = getLocation(type)
  if(!url_) {
    return cb({
      msg: `Error - no route to ${type} found`,
      noretry: true
    })
  }
  if(typeof params == 'function') {
    cb = params
    params = null
  }

  let xhr = new XMLHttpRequest()

  xhr.onreadystatechange = function() {
    if(xhr.readyState !== XMLHttpRequest.DONE) return
    if(called) return
    called = true
    handleResponse(xhr.status, xhr.responseText, cb)
  }

  xhr.ontimeout = function(e) {
    if(called) return
    called = true
    handleResponse(504, null, cb)
  }

  xhr.open("POST", url_)
  xhr.timeout = 30*1000
  if(params) {
    xhr.setRequestHeader("Content-Type", "application/json")
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
