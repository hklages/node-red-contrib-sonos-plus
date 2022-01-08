'use strict'

// https://williamboles.me/discovering-whats-out-there-with-ssdp/

// https://nodejs.org/api/dgram.html
const dgram = require('dgram')
// https://www.tutorialspoint.com/nodejs/nodejs_event_emitter.htm
const eventEmitter = require('events').EventEmitter
// https://github.com/debug-js/debug
const debug = require('debug')('discovery-hk')

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
const BROADCAST_BUFFER = Buffer.from(['M-SEARCH * HTTP/1.1',
  `HOST: ${ADDRESS}:${PORT}`,
  'MAN: "ssdp:discover"',
  'MX: 1',
  'ST: urn:schemas-upnp-org:device:ZonePlayer:1'].join('\r\n'))
const SEARCH_SUCCESS = 'player found'
const SEARCH_TIMEOUT = 'timeout reached'
const SEARCH_ERROR = 'search error'

const SEARCH_TIMEOUT_DURATION = 16000 // 6 seconds
const SEARCH_SONOS_IDENTIFIER = 'Sonos'

class SonosPlayerDiscovery {

  constructor () { 
    this.SEARCH_TIMEOUT_MESSAGE = 'No players found'
    // methodology to transport search status
    this.searchStatusEvent = new eventEmitter()
  }

  sendBroadcast () {
    debug('method sendBroadcast')
    this.socket.send(BROADCAST_BUFFER, 0, BROADCAST_BUFFER.length,
      PORT, ADDRESS, (err) => {
        if (err) {
          this.searchStatusEvent.emit(SEARCH_ERROR, err)
        } else {
          debug('OK broadcast was sent!')
        }
      })
  }

  doBroadcastWithTimeout (milliSeconds) {
    debug('method doBroadcastWithTimeout')
    this.sendBroadcast()
    this.broadcastTimeOutId = setTimeout(() => {
      this.searchStatusEvent.emit(SEARCH_TIMEOUT)
      debug(SEARCH_TIMEOUT)
    }, milliSeconds)
  }

  cleanup () {
    debug('method cleanup')
    if (this.socket) {
      this.socket.close()
    }
    if (this.broadcastTimeOutId !== undefined) {
      clearTimeout(this.broadcastTimeOutId)
    }
    if (this.searchStatusEvent !== undefined) {
      this.searchStatusEvent = null
    }
  }

  async discoverOnePlayer () {
    debug('method discoverOnePlayer')
    return new Promise((resolve, reject) => {
      
      // process the emitted events
      this.searchStatusEvent.once(SEARCH_SUCCESS, (player) => {
        debug(SEARCH_SUCCESS)
        this.cleanup()
        resolve(player)
      })
      this.searchStatusEvent.once(SEARCH_TIMEOUT, () => {
        debug(this.SEARCH_TIMEOUT_MESSAGE)
        this.cleanup()
        reject(new Error(this.SEARCH_TIMEOUT_MESSAGE))
      })
      this.searchStatusEvent.once(SEARCH_ERROR, (err) => {
        debug(SEARCH_ERROR)
        this.cleanup()
        reject(new Error(SEARCH_ERROR + JSON.stringify(err)))
      })

      // define and bind socket
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      this.socket.on('error', (err) => {
        debug(SEARCH_ERROR)
        this.searchStatusEvent.emit(SEARCH_ERROR, err)
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
        if (msgString.includes(SEARCH_SONOS_IDENTIFIER)) {
          this.searchStatusEvent.emit(SEARCH_SUCCESS, rinfo.address)
        }
      })
      
      this.socket.bind(() => {
        debug('random port:' + this.socket.address().port)
        this.doBroadcastWithTimeout(SEARCH_TIMEOUT_DURATION)
      })
    })
  }
}

module.exports = SonosPlayerDiscovery
