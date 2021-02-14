// These tests only work in my specific envirionment
// Using http://192.168.178.37:1400 a SONOS Play:5
// using http://192.168.178.38:1400 a SONOS Play:1 usually switched off
// using http://192.168.178.15:1400 a Synology NAS 

const { xIsSonosPlayer }
  = require('../src/Sonos-Extensions.js')

const { describe, it } = require('mocha')
const { expect } = require('chai')

describe('xIsSonosPlayer function', () => {
  
  it('wrong syntax returns false', async () => {
    const playerUrl = new URL('http://192.168.17837:1400')
    const timeout = 500
    const result = await xIsSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
 
  it('fritzbox returns false', async () => {
    const playerUrl = new URL('http://192.168.178.1:1400')
    const timeout = 500
    const result = await xIsSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Play:5 returns true', async () => {
    const playerUrl = new URL('http://192.168.178.37:1400')
    const timeout = 500
    const result = await xIsSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('NAS returns false', async () => {
    const playerUrl = new URL('http://192.168.178.15:1400')
    const timeout = 500
    const result = await xIsSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Play:1 returns false if switched off', async () => {
    const playerUrl = new URL('http://192.168.178.38:1400')
    const timeout = 500
    const result = await xIsSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

})