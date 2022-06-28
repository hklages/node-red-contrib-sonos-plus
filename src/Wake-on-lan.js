'use strict'

/**
 * SONOS Roam/Move wake on LAN/WLAN. Sends a magic package to the specified mac address.
 *
 *   @module Wake-on-lan
 *   
 *   @author Henning Klages
 *    
 *   @since 2022-06-27
*/

const dgram = require('dgram')
const { Buffer } = require('buffer')

// https://github.com/debug-js/debug
const { PACKAGE_PREFIX } = require('./Globals.js')
const debug = require('debug')(`${PACKAGE_PREFIX}wake-on-lan`)

module.exports = {

  /**
   * Send the magic package to the device to wake the device up. 
   * Works even over WiFi. Uses upd and broadcasts.
   * 
   * @param {string} macAddress valid mac address such as F0:F6:C1:D5:AE:08
   * 
   * Inspired by: https://github.com/thisismexp/wake-on-lan-npm/blob/master/index.js
  */ 
  sendWakeUp: async (macAddress) => {
    debug('method sendWakeUp')

    // create magic package
    const macAddressCleaned = macAddress.replace(/([^A-F^a-f^0-9])/g, '')
    const magicPacket = Buffer.allocUnsafe(102)
    magicPacket.write('ffffffffffff', 'hex')
    for (let i = 1; i < 17; i += 1) {
      magicPacket.write(macAddressCleaned, i * 6, 'hex')
    }

    // initialize sockets
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    
    socket.on('error', (err) => {
      socket.close()
      debug('Error during sendWakeUp')
      throw new Error(`${PACKAGE_PREFIX} Error sendWakeUp (any)` + JSON.stringify(err.message))
    })

    socket.once('listening', () => {
      socket.setBroadcast(true)
    })

    // send package
    socket.send(magicPacket, 0, magicPacket.length, 9, '255.255.255.255', (err) => {
      socket.close
      if (err) {
        throw new Error(`${PACKAGE_PREFIX} Error sendWakeUp (send)` + JSON.stringify(err.message))
      }
    })
  }
}