// These tests only work in my specific envirionment
// Using http://192.168.178.37:1400 a SONOS Play:5
// using http://192.168.178.38:1400 a SONOS Play:1 usually switched off
// using http://192.168.178.15:1400 a Synology NAS 

const { isSonosPlayer, matchSerialUuid }
  = require('../src/Extensions.js')

const { describe, it } = require('mocha')
const { expect } = require('chai')

describe('isSonosPlayer function', () => {
  
  it('wrong syntax returns false', async () => {
    const playerUrl = new URL('http://192.168.17837:1400')
    const timeout = 500
    const result = await isSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
 
  it('fritzbox returns false', async () => {
    const playerUrl = new URL('http://192.168.178.1:1400')
    const timeout = 500
    const result = await isSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Play:5 returns true', async () => {
    const playerUrl = new URL('http://192.168.178.37:1400')
    const timeout = 500
    const result = await isSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('NAS returns false', async () => {
    const playerUrl = new URL('http://192.168.178.15:1400')
    const timeout = 500
    const result = await isSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Play:1 returns false if switched off', async () => {
    const playerUrl = new URL('http://192.168.178.38:1400')
    const timeout = 500
    const result = await isSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

})

describe('matchSerialUuid function', () => {
  
  it('equal provides true', async () => {
    const serial = '00-0E-58-FE-3A-EA:5'
    const uuid = 'RINCON_000E58FE3AEA01400'
    const result = await matchSerialUuid(serial, uuid)
    expect(result).
      be.a('boolean').
      equal(true)
  })

  it('not same provides false', async () => {
    const serial = '94-9F-3E-C1-3B-99:8'
    const uuid = 'RINCON_000E58FE3AEA01400'
    const result = await matchSerialUuid(serial, uuid)
    expect(result).
      be.a('boolean').
      equal(false)
  })
})