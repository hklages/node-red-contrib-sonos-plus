// These tests only work in my specific envirionment
// Using http://192.168.178.37:1400 a SONOS Play:5
// using http://192.168.178.38:1400 a SONOS Play:1 usually switched off
// using http://192.168.178.15:1400 a Synology NAS 

const { isSonosPlayer, getDeviceInfo, matchSerialUuid, parseZoneGroupToArray }
  = require('../src/Extensions.js')

const { describe, it } = require('mocha')
const { expect } = require('chai')
const { PACKAGE_PREFIX } = require('../src/Globals.js')

describe('parseZoneGroupToArray function', () => { 
  
  const TEST_DATA =  require('./testdata.json')
  
  // deep comparison not possible as urlObject is object or string
  it('3Player-1Group-CoKitchen - lenght and coordinator name', async () => {
    const TEST_1 = TEST_DATA['3Player_1Group_Coordinator_Kitchen']
    const result = await parseZoneGroupToArray(TEST_1.ZoneGroupState, PACKAGE_PREFIX)
    expect(result.length)
      .to.equal(TEST_1.result.length)
    expect(result[0].length)
      .to.equal(TEST_1.result[0].length)
    expect(result[0][0].playerName)
      .be.a('string')
      .to.equal(TEST_1.result[0][0].playerName)
    expect(result[0][0].uuid)
      .to.equal(TEST_1.result[0][0].uuid)
  })

  it('3Player-1Group-CoLiving -  length and coordinator name', async () => {
    const TEST = TEST_DATA['3Player_1Group_Coordinator_Living']
    const result = await parseZoneGroupToArray(TEST.ZoneGroupState, PACKAGE_PREFIX)
    expect(result.length)
      .to.equal(TEST.result.length)
    expect(result[0].length)
      .to.equal(TEST.result[0].length)
    expect(result[0][0].playerName)
      .be.a('string')
      .to.equal(TEST.result[0][0].playerName)
    expect(result[0][0].uuid)
      .to.equal(TEST.result[0][0].uuid)
  })

  it('3Player-3Groups - length and playerName string', async () => {
    const TEST = TEST_DATA['3Player_3Groups']
    const result = await parseZoneGroupToArray(TEST.ZoneGroupState, PACKAGE_PREFIX)
    expect(result.length) // number of groups
      .to.equal(TEST.result.length)
    expect(result[0].length)
      .to.equal(TEST.result[0].length)
    expect(result[1].length)
      .to.equal(TEST.result[1].length)
    expect(result[2].length)
      .to.equal(TEST.result[2].length)
    expect(result[0][0].playerName)
      .be.a('string')
    expect(result[1][0].playerName)
      .be.a('string')
    expect(result[2][0].playerName)
      .be.a('string')
  })

  it('1Player - length and playerName string', async () => {
    const TEST = TEST_DATA['1Player']
    const result = await parseZoneGroupToArray(TEST.ZoneGroupState, PACKAGE_PREFIX)
    expect(result.length) // number of groups
      .to.equal(TEST.result.length)
    expect(result[0].length)
      .to.equal(TEST.result[0].length)
    expect(result[0][0].playerName)
      .be.a('string')
      .equal(TEST.result[0][0].playerName)
  })

  it('1Player-name39 - length and playerName string', async () => {
    const TEST = TEST_DATA['1Player-name-39']
    const result = await parseZoneGroupToArray(TEST.ZoneGroupState, PACKAGE_PREFIX)
    expect(result.length) // number of groups
      .to.equal(TEST.result.length)
    expect(result[0].length)
      .to.equal(TEST.result[0].length)
    expect(result[0][0].playerName)
      .be.a('string')
      .equal(TEST.result[0][0].playerName)
  })

  it('4Player-2Groups - length and Coordinator', async () => {
    const TEST = TEST_DATA['4Player-2Group-CoKitchen-CoBath']
    const result = await parseZoneGroupToArray(TEST.ZoneGroupState, PACKAGE_PREFIX)
    expect(result.length) // number of groups
      .to.equal(TEST.result.length)
    expect(result[0].length)
      .to.equal(TEST.result[0].length)
    expect(result[1].length)
      .to.equal(TEST.result[1].length)
    expect(result[0][0].playerName)
      .be.a('string')
      .equal('Küche')
    expect(result[1][0].playerName)
      .be.a('string')
      .equal('Bad')
    
  })
})

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