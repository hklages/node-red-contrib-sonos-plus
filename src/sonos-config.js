/**
 * All configuration data- is being used in Universal and My Sonos node 
 *
 * @module Config
 *
 * @author Henning Klages
 *
 * @since 2020-12-16
 */

'use strict'

const { PACKAGE_PREFIX } = require('./Globals.js')

const { discoverPlayersHost, discoverPlayersSerialnumber } = require('./Discovery.js')

const debug = require('debug')(`${PACKAGE_PREFIX}config`)

module.exports = function (RED) {

  let node = {} // used for sending node.error, node.debug

  function SonosPlayerNode (config) {
    RED.nodes.createNode(this, config)

    node = this
    node.serialnum = config.serialnum
    node.ipaddress = config.ipaddress
  }

  RED.httpNode.get('/nrcsp/*', function (req, response) {
    debug('httpNode - received get')

    switch (req.params[0]) {
    case 'discoverPlayersHost':
      debug('starting discovery')
      discoverPlayersHost()
        .then((playerList) => {
          debug('found player during discovery')
          response.json(playerList)
        })
        .catch((error) => {
          debug('error discovery >>%s', JSON.stringify(error, Object.getOwnPropertyNames(error)))
        })
      break
    
    case 'discoverPlayersSerialNumber':
      debug('starting discovery')
      discoverPlayersSerialnumber()
        .then((playerList) => {
          debug('found player during discovery')
          response.json(playerList)
        })
        .catch((error) => {
          debug('error discovery >>%s', JSON.stringify(error, Object.getOwnPropertyNames(error)))
        })
      break

    default:
      // eslint-disable-next-line max-len
      response.json('available nrcsp endpoints: discoverPlayers')
      
    }   
  })

  RED.nodes.registerType('sonos-config', SonosPlayerNode)
}
