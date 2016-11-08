'use strict'
/**
 * Copyright (C) 2016 Apigee Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Edge Management API calls
 *
 * @param proxyData
 * @param proxyData.org
 * @param proxyData.env
 * @param proxyData.user
 * @param proxyData.pass
 * @param proxyData.proxyname
 *
 * @module
 */

var request = require('request')
var config = require('./config')
var logger = require('./logger')

/* Destructure, spread operator: Node 6
function auth(obj) {
  const {user, pass} = obj
  return {user, pass}
}

function mgmtUrl() {
  const vX = config.get('APIGEE_MGMT_API_URL')
  return [vX, ...arguments].join('/')
}

function org(obj, ...rest) {
  return mgmtUrl('organizations', obj.org, ...rest)
}

function orgEnv(obj, ...rest) {
  return org(obj, 'environments', obj.env, ...rest)
}
*/

function auth(obj) {
  return {
    user: obj.user,
    pass: obj.pass
  }
}

function mgmtUrl() {
  const args = Array.prototype.slice.call(arguments)
  const vX = config.get('APIGEE_MGMT_API_URL')
  return [vX].concat(args).join('/')
}

function org() {
  const args = Array.prototype.slice.call(arguments)
  const obj = args.shift()
  return mgmtUrl.apply(null, ['organizations', obj.org].concat(args))
}

function orgEnv() {
  const args = Array.prototype.slice.call(arguments)
  const obj = args.shift()
  return org.apply(null, [obj, 'environments', obj.env].concat(args))
}


function getProxyRevision (proxyData, callback) {
  var options = {
    url: org(proxyData, 'apis', proxyData.proxyname),
    auth: auth(proxyData)
  }
  request.get(options, function (err, res, body) {
    if (err) {
      var loggerError = logger.ERR_APIGEE_REQ_FAILED(err)
      callback(loggerError)
    } else if (res.statusCode == 401) {
      var loggerError = logger.ERR_APIGEE_AUTH(err, 401)
      callback(loggerError)
    } else if (res.statusCode == 404) {
      var loggerError = logger.ERR_APIGEE_PROXY_NOT_FOUND(err, 404)
      callback(loggerError)
    } else if (res.statusCode !== 200) {
      var loggerError = logger.ERR_APIGEE_GET_PROXY_REV_FAILED(body, res.statusCode)
      callback(loggerError)
    } else {
      body = JSON.parse(body)
      var revision = body.revision.pop()
      callback(null, revision)
    }
  })
}

function importProxy (proxyData, zipBuffer, callback) {
  var formData = {
    file: zipBuffer
  }
  var options = {
    url: org(proxyData, 'apis'),
    formData: formData,
    qs: {
      action: 'import',
      name: proxyData.proxyname
    },
    auth: auth(proxyData)
  }
  request.post(options, function (err, httpResponse, body) {
    if (err) {
      var loggerError = logger.ERR_APIGEE_REQ_FAILED(err)
      callback(loggerError)
    } else if (httpResponse.statusCode !== 201) {
      var loggerError = logger.ERR_APIGEE_PROXY_UPLOAD(body, httpResponse.statusCode)
      callback(loggerError)
    } else {
      deployProxy(proxyData, callback)
    }
  })
}


function deployments(obj, revision) {
  return orgEnv(obj, 'apis', obj.proxyname, 'revisions', revision, 'deployments')
}

function deployProxy (proxyData, callback) {
  // should get latest version and deploy that
  getProxyRevision(proxyData, function (err, revision) {
    if (err) {
        var loggerError = logger.ERR_UAE(err)
        callback(loggerError)
    } else {
      var options = {
        url: deployments(proxyData, revision),
        auth: auth(proxyData)
      }
      request.post(options, function (err, res, body) {
        if (err) {
          var loggerError = logger.ERR_APIGEE_DEPLOY_PROXY(err)
          callback(loggerError)
        } else {
          callback(null, res)
        }
      })
    }
  })
}

function undeployProxy (proxyData, callback) {
  // should get latest version and undeploy that
  getProxyRevision(proxyData, function (err, revision) {
    if (err) {
        var loggerError = logger.ERR_UAE(err)
        callback(loggerError)
    } else {
      var options = {
        url: deployments(proxyData, revision),
        auth: auth(proxyData)
      }
      request.del(options, function (err, res, body) {
        if (err) {
          var loggerError = logger.ERR_APIGEE_UNDEPLOY_PROXY_FAILED(err)
          callback(loggerError)
        } else {
          callback(null, res)
        }
      })
    }
  })
}

function getVirtualHosts (proxyData, callback) {
  var options = {
    url: orgEnv(proxyData, 'virtualhosts'),
    auth: auth(proxyData)
  }
  request.get(options, function (err, res, body) {
    if (err) {
      var loggerError = logger.ERR_APIGEE_REQ_FAILED(err)
      callback(loggerError)
    } else if (res.statusCode !== 200) {
      var loggerError = logger.ERR_PROXY_VHOSTS_NON200_RES(body, res.statusCode)
      callback(loggerError)
    } else {
      callback(null, body)
    }
  })
}


function authenticate (authOptions, callback) {
  var options = {
    url: org(authOptions),
    auth: auth(authOptions)
  }
  request.get(options, function (err, res, body) {
    if (err) {
      var loggerError = logger.ERR_APIGEE_REQ_FAILED(err)
      callback(loggerError)
    } else if (res.statusCode !== 200) {
      var loggerError = logger.ERR_APIGEE_AUTH(body, res.statusCode)
      callback(loggerError)
    } else {
      callback(null, body)
    }
  })
}

module.exports = {
  importProxy: importProxy,
  getVirtualHosts: getVirtualHosts,
  deployProxy: deployProxy,
  undeployProxy: undeployProxy,
  authenticate: authenticate
}
