'use strict'

/**
 * Class for SONOS player discovery in a local network.
 * 
 *  METHOD: We use a random port to create a UDP socket and send a specific broadcast
 * message to PORT = 1900 and ADDRESS = '239.255.255.250'. 
 * We listen for a while (SEARCH_TIMEOUT_DURATION) assuming that  
 * any existing SONOS player will respond in that time period. 
 *
 *  EXAMPLE: 
 *   const playerDiscovery = new SonosPlayerDiscovery()
 *   const player = playerDiscovery.discoverOnePlayer()
 *   - throws error if timeout.
 * 
 *   @module Discovery-base-hk
 *   
 *   @author Henning Klages
 *    
 *   @since 2022-01-08
*/

// https://williamboles.me/discovering-whats-out-there-with-ssdp/

// https://nodejs.org/api/dgram.html
const dgram = require('dgram')

// https://www.tutorialspoint.com/nodejs/nodejs_event_emitter.htm
const eventEmitter = require('events').EventEmitter
const searchStatusEvent = new eventEmitter()

// https://github.com/debug-js/debug
const { PACKAGE_PREFIX } = require('./Globals.js')
const debug = require('debug')(`${PACKAGE_PREFIX}discovery-base`)

const PORT = 1900
const ADDRESS = '239.255.255.250'
// Alternatives - both work for SONOS. The first provides only the group!
// ST urn:smartspeaker-audio:service:SpeakerGroup:1
// ST urn:schemas-upnp-org:device:ZonePlayer:1
//
// To discover also NON-SONOS devices use:
// ST ssdp:all
//
// MAN should use " " although SONOS works without.
// MX between 1 and 5. Player can choose random response time 1 .. MX
const BROADCAST_BUFFER = Buffer.from(['M-SEARCH * HTTP/1.1',
  `HOST: ${ADDRESS}:${PORT}`,
  'MAN: "ssdp:discover"',
  'MX: 3',
  'ST: urn:schemas-upnp-org:device:ZonePlayer:1'].join('\r\n'))
const SEARCH_MESSAGE_SUCCESS = 'player found'
const SEARCH_MESSAGE_TIMEOUT = 'timeout reached'
const SEARCH_MESSAGE_ERROR = 'search error'

class SonosPlayerDiscovery {

  constructor () { 
    this.SEARCH_TIMEOUT_MESSAGE = 'No players found'
    this.SEARCH_TIMEOUT_DURATION = 6000 // 6 seconds
    this.SEARCH_SONOS_IDENTIFIER = 'Sonos'
  }

  doBroadcastWithTimeout (timeoutInMs) {
    debug('method doBroadcastWithTimeout')
  
    // send broadcast
    this.socket.send(BROADCAST_BUFFER, 0, BROADCAST_BUFFER.length,
      PORT, ADDRESS, (err) => {
        if (err) {
          searchStatusEvent.emit(SEARCH_MESSAGE_ERROR, err)
        } else {
          debug('OK broadcast was sent!')
        }
      })
    
    //set timeout and emit message
    this.broadcastTimeOutId = setTimeout(() => {
      searchStatusEvent.emit(SEARCH_MESSAGE_TIMEOUT)
      debug(SEARCH_MESSAGE_TIMEOUT)
    }, timeoutInMs)
  }

  cleanup () {
    debug('method cleanup')
    if (this.socket) {
      this.socket.close()
    }
    if (this.broadcastTimeOutId !== undefined) {
      clearTimeout(this.broadcastTimeOutId)
    }
  }

  async discoverOnePlayer() {
    /**
     *  @returns {Promise<string>} ipv4 address of first found player
     */
   
    debug('method discoverOnePlayer')
    return new Promise((resolve, reject) => {
      
      // process the emitted events: success, timeout, error
      searchStatusEvent.once(SEARCH_MESSAGE_SUCCESS, (player) => {
        debug(SEARCH_MESSAGE_SUCCESS)
        this.cleanup()
        resolve(player)
      })
      searchStatusEvent.once(SEARCH_MESSAGE_TIMEOUT, () => {
        debug(this.SEARCH_TIMEOUT_MESSAGE)
        this.cleanup()
        reject(new Error(this.SEARCH_TIMEOUT_MESSAGE))
      })
      searchStatusEvent.once(SEARCH_MESSAGE_ERROR, (err) => {
        debug(SEARCH_MESSAGE_ERROR)
        this.cleanup()
        reject(new Error(SEARCH_MESSAGE_ERROR + JSON.stringify(err)))
      })

      // define and bind socket
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      this.socket.on('error', (err) => {
        debug(SEARCH_MESSAGE_ERROR)
        searchStatusEvent.emit(SEARCH_MESSAGE_ERROR, err)
      })
      this.socket.on('listening', () => {
        // following are not needed
        // socket.setBroadcast(true)
        // socket.addMembership(ADDRESS)
        // socket.setMulticastTTL(128)
        debug(`Start listening at port >${this.socket.address().port}`)
      })
      this.socket.on('message', (msg, rinfo) => {
        debug(`Received udp message ${msg}`)
        const msgString = msg.toString()
        if (msgString.includes(this.SEARCH_SONOS_IDENTIFIER)) {
          searchStatusEvent.emit(SEARCH_MESSAGE_SUCCESS, rinfo.address)
        }
      })
      
      this.socket.bind(() => {
        debug('random port:' + this.socket.address().port)
        this.doBroadcastWithTimeout(this.SEARCH_TIMEOUT_DURATION)
      })
    })
  }
}

module.exports = SonosPlayerDiscovery
