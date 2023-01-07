/**
 * This module is is to update the config data from given user input
 * and provides a http server to access the back end.  It is being used 
 * in Universal and My Sonos node.
 * 
 * Endpoints at /nrcsp
 * discoverAllPlayerWithHost - discover SONOS player via UDP SSDP broadcast
 * discoverAllPlayerWithSerial - same but based on serial
 * @module Config
 *
 * @author Henning Klages
 *
 * @since 2023-01-05
 */

'use strict'

const { PACKAGE_PREFIX } = require('./Globals.js')

const { discoverAllPlayerWithHost, discoverAllPlayerWithSerialnumber } = require('./Discovery.js')

const { isTruthyProperty } = require('./Helper.js')

const debug = require('debug')(`${PACKAGE_PREFIX}config`)

module.exports = function (RED) {

  let node = {} // necessary

  function SonosPlayerNode (config) {
    RED.nodes.createNode(this, config)

    node = this
    node.serialnum = config.serialnum
    node.ipaddress = config.ipaddress
  }

  //
  //          HTTP Server to access backend: Discovery
  // ...................................................................

  RED.httpAdmin.get('/nrcsp/*', function (req, response) {
    debug('method:%s', 'REDhttpAdmin.get')

    const NO_PLAYER_MESSAGE = 'No players found'

    switch (req.params[0]) {
    case 'discoverAllPlayerWithHost':
      debug('starting discovery')
      discoverAllPlayerWithHost()
        .then((playerList) => {
          debug('found player during discovery')
          response.json(playerList)
        })
        .catch((error) => {
          if (isTruthyProperty(error, ['message'])) {
            if (error.message === NO_PLAYER_MESSAGE) {
              debug('could not find any player')   
              response.json({ 'label': 'no player found', 'value': '' })
              return
            } 
          }
          debug('error discovery >>%s', JSON.stringify(error, Object.getOwnPropertyNames(error)))  
        })
      break
    
    case 'discoverAllPlayerWithSerialnumber':
      debug('starting discovery')
      discoverAllPlayerWithSerialnumber()
        .then((playerList) => {
          debug('found player during discovery')
          response.json(playerList)
        })
        .catch((error) => {
          if (isTruthyProperty(error, ['message'])) {
            if (error.message === NO_PLAYER_MESSAGE) {
              debug('could not find any player')   
              response.json({ 'label': 'no player found', 'value': '' })
              return
            } 
          }
          debug('error discovery >>%s', JSON.stringify(error, Object.getOwnPropertyNames(error))) 
        })
      break

    default:
      // eslint-disable-next-line max-len
      response.json('available endpoints: discoverAllPlayerWithSerialnumber, discoverAllPlayerWithHost')
    }   
  })

  RED.nodes.registerType('sonos-config', SonosPlayerNode)
}
