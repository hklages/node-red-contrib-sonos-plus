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

module.exports = function (RED) {

  let node = {} // used for sending node.error, node.debug

  function SonosPlayerNode (config) {
    RED.nodes.createNode(this, config)

    node = this
    node.serialnum = config.serialnum
    node.ipaddress = config.ipaddress
  }

  // Build API to auto detect IP Addresses
  RED.httpNode.get('/sonosSearch', function (req, response) {
    discoverSonosPlayer(function (playerList) {
      response.json(playerList)
    })
  })

  function discoverSonosPlayer (discoveryCallback) {
    const sonos = require('sonos')

    const playerList = [] // list of all discovered SONOS players

    if (!discoveryCallback) {
      node.error('No callback defined in discoverSonosPlayer')
      return
    }

    // define discovery and store in playerList
    const searchTime = 5000 // in miliseconds
    node.debug('OK Start searching for players')
    const discovery = sonos.DeviceDiscovery({ timeout: searchTime })

    // listener  'DeviceAvailable'
    discovery.on('DeviceAvailable', sonosPlayer => {
      sonosPlayer.deviceDescription()
        .then(data => {
          playerList.push({
            label: data.friendlyName + '::' + data.roomName,
            value: data.serialNum
          })
          node.debug('OK Found SONOS player ' + data.serialNum)
        })
        .catch(err => {
          node.error('DeviceDiscovery description error:: Details: ' + JSON.stringify(err))
        })
    })

    // listener 'timeout' only once
    discovery.once('timeout', () => {
      if (playerList.length === 0) {
        node.error('Did not find any sonos any player')
      } else {
        node.debug('OK Found player, returning result')
      }
      discoveryCallback(playerList)
    })
  }

  RED.nodes.registerType('sonos-config', SonosPlayerNode)
}
