'use strict'

/*    understand/
 * By default we retry the get request couple of time - once after a
 * second and once after 5, then after 15, and 25 seconds. This makes
 * the request 'slow' but more stable.
 */
function get(type, params, cb) {
  retry([1,5,15,25], get_, type, params, cb)
}

/*    understand/
 * By default we retry the post request couple of time - once after a
 * second and once after 5, then after 15, and 25 seconds. This makes
 * the request 'slow' but more stable.
 */
function post(type, params, cb) {
  retry([1,5,15,25], post_, type, params, cb)
}

/*    outcome/
 * Call the function and, if it fails, call it again on the given
 * schedule. Note that we don't want to call the function multiple
 * times, so if the function is the 'get' or 'post' (which already calls
 * retry) we change it to the more 'raw' version - 'get_' or 'post_'
 */
function retry(schedule, fn, type, params, cb) {
  if(fn == get) fn = get_
  if(fn == post) fn = post_

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
    fn(type, params, (err, res) => {
      if(!err) return cb(err, res)
      if(ndx >= schedule.length) return cb(err, res)
      if(err.noretry) return cb(err, res)
      let retryafter = schedule[ndx]
      if(ndx) retryafter -= schedule[ndx-1]
      setTimeout(() => call_ndx_1(ndx+1), retryafter * 1000)
    })
  }
}

function get_(type, params, cb) {
  send_('GET', type, params, cb)
}

function post_(type, params, cb) {
  send_('POST', type, params, cb)
}

/*    outcome/
 * We get the location of the service for the given type and send an
 * AJAX request, handling redirects when requested.
 */
function send_(verb_, type, params, cb) {
  let url_ = getLocation(type)
  if(typeof params == 'function') {
    cb = params
    params = null
  }

  let xhr = new XMLHttpRequest()

  xhr.onreadystatechange = function() {
    if(xhr.readyState !== XMLHttpRequest.DONE) return
    handleResponse(xhr.status, xhr.responseText, (err, resp) => {
      if(err && err.redirect) redirect(err.msg, verb_, type, params, cb)
      else cb(err, resp)
    })
  }

  xhr.open(verb_, url_)
  if(params) {
    xhr.setRequestHeader("Content-Type", "application/json")
    xhr.send(JSON.stringify(params))
  } else {
    xhr.send()
  }
}

/*    understand/
 * If the response status is:
 *  0: the connection has failed
 *  300: the request has to be redirected
 *  400: the request has failed - do not retry
 *  500: the request has failed - you can retry
 *  200: the response has succeeded
 *
 *    outcome/
 * If we have a JSON response then return that, otherwise create a JSON
 * object with the response as a message field (if we don't have a
 * response at all use a default message). Then we return the given
 * callback.
 *
 * If there are errors we set the `noretry` or `redirect` fields and
 * return the callback error.  If an error message looks like a HTML
 * response we output it to the console and use the default message
 * again.
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
  else {
    if(status == 300) resp.redirect = true
    if(status >= 400 && status < 500) resp.noretry = true

    if(is_html_1(resp.msg)) {
      console.error(resp.msg)
      resp.msg = defaultMsg
    }

    return cb(resp)
  }

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

let LOCATIONS = {}
/*    outcome/
 * If the type has a specific endpoint set, we use that. Otherwise we
 * use our current server.
 */
function getLocation(type) {
  let svr
  if(LOCATIONS[type]) svr = LOCATIONS[type]
  else svr = `${window.location.protocol}//${window.location.host}`
  if(svr[svr.length-1] == '/') return `${svr}${type}`
  else return `${svr}/${type}`
}

/*    outcome/
 * Set the type to be located at the new location and then make another
 * AJAX request which will now be sent to the new redirect
 */
function redirect(loc, verb_, type, params, cb) {
  LOCATIONS[type] = loc
  send_(verb_, type, params, cb)
}
