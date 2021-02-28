// These tests only work in my specific envirionment
// Using http://192.168.178.37:1400 a SONOS Play:5
// using http://192.168.178.38:1400 a SONOS Play:1 usually switched off
// using http://192.168.178.15:1400 a Synology NAS 

const { isSonosPlayer, getDeviceInfo, matchSerialUuid }
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

describe('getDeviceInfo function', () => { 

  it('kitchen returns id RINCON_5CAAFD00223601400', async () => {
    const playerUrl = new URL('http://192.168.178.37:1400')
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.id)
      .be.a('string')
      .equal('RINCON_5CAAFD00223601400')
  })

  it('kitchen has line in', async () => {
    const playerUrl = new URL('http://192.168.178.37:1400')
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities)
      .to.include('LINE_IN')
  })

  it('living returns id RINCON_949F3EC13B9901400', async () => {
    const playerUrl = new URL('http://192.168.178.36:1400')
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.id)
      .be.a('string')
      .equal('RINCON_949F3EC13B9901400')
  })

  it('living has tv', async () => {
    const playerUrl = new URL('http://192.168.178.36:1400')
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities)
      .to.include('HT_PLAYBACK')
  })

  it('bath has no tv', async () => {
    const playerUrl = new URL('http://192.168.178.35:1400')
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities)
      .to.not.include('HT_PLAYBACK')
  })

  it('bath has no line in', async () => {
    const playerUrl = new URL('http://192.168.178.35:1400')
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities)
      .to.not.include('LINE_IN')
  })

  it('bath with too small time out throws error', async () => {
    const playerUrl = new URL('http://192.168.178.35:1400')
    const timeout = 50
    await getDeviceInfo(playerUrl, timeout)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'timeout of 50ms exceeded')
      })
  })

  it('fritzbox throws error', async () => {
    const playerUrl = new URL('http://192.168.178.1:1400')
    const timeout = 2000
    await getDeviceInfo(playerUrl, timeout)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'timeout of 2000ms exceeded')
      })
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