/**
 * All configuration data - is being used in Universal and My Sonos node 
 *
 * @module Config
 *
 * @author Henning Klages
 *
 * @since 2021-02-21
 */

'use strict'

const { PACKAGE_PREFIX, TIMEOUT_DISCOVERY } = require('./Globals.js')

const { discoverPlayersHost, discoverPlayersSerialnumber } = require('./Discovery.js')
const { isTruthy, isTruthyProperty } = require('./Helper.js')

const debug = require('debug')(`${PACKAGE_PREFIX}config`)

module.exports = function (RED) {

  let node = {} // necessary

  function SonosPlayerNode (config) {
    RED.nodes.createNode(this, config)

    node = this
    node.serialnum = config.serialnum
    node.ipaddress = config.ipaddress
  }

  RED.httpNode.get('/nrcsp/*', function (req, response) {
    debug('httpNode - received get')

    const NO_PLAYER_MESSAGE = 'No players found' // from sonos-ts

    switch (req.params[0]) {
    case 'discoverPlayersHost':
      debug('starting discovery')
      discoverPlayersHost(TIMEOUT_DISCOVERY)
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
    
    case 'discoverPlayersSerialNumber':
      debug('starting discovery')
      discoverPlayersSerialnumber(TIMEOUT_DISCOVERY)
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
      response.json('available endpoints: discoverPlayersSerialNumber, discoverPlayersHost')
    }   
  })

  RED.nodes.registerType('sonos-config', SonosPlayerNode)
}
