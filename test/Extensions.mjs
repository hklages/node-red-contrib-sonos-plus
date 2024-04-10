// async/await syntax makes plugins such chai-as-promised obsolete
// Passing lambdas (or arrow functions) to Mocha is discouraged therefore we do:
// describe('xxxxx', function(){}) instead of describe('xxxxx', () => {})
// That makes the this.timeout work!

// These tests only work in my specific environment
// Using http://192.168.178.51:1400 a SONOS Play:5
// using http://192.168.178.54:1400 a SONOS Play:1 usually switched off
// using http://192.168.178.53:1400 a SONOS Play:3
// using http://192.168.178.15:1400 a Synology NAS

import pkg from '../src/Extensions.js' 
const { isOnlineSonosPlayer, getDeviceInfo, matchSerialUuid, parseZoneGroupToArray,
  parseBrowseToArray, guessProcessingType, validatedGroupProperties, extractGroup,
  // eslint-disable-next-line max-len
  parseAlarmsToArray
} = pkg
import { describe, it } from 'mocha'
import { expect } from 'chai'

import TEST_DATA_ZONEGROUP from './testdata-parsezonegroup.json'with { type: "json" }

const PLAY5 = 'http://192.168.178.51:1400'
const BEAM = 'http://192.168.178.56:1400'
const PLAY1 = 'http://192.168.178.54:1400'
const BATH = 'http://192.168.178.52:1400'
const SYNOLOGY_INVALID = 'http://192.168.178.15:1400' // is not a sonos player

const FRITZBOX_IP = '192.168.178.1'

const PLAYERNAME_KITCHEN = 'SonosKueche'


describe('extractGroup function', function () {
  
  it('playerName used and ok ', async () => {
    let groupData = TEST_DATA_ZONEGROUP['3Player_1Group_Coordinator_Kitchen'].result
    groupData = groupData.map(group => {
      group = group.map(member => {
        member.urlObject = new URL(member.urlObject)
        return member
      })
      return group
    })
    const playerUrlHost = FRITZBOX_IP // wrong but not used!
    const playerName = 'Bad' // old name
    const result = await extractGroup(playerUrlHost, groupData, playerName)
    expect(result)
      .be.a('object')
    expect(result.groupId)
      .be.a('string')
      .to.equal('RINCON_5CAAFD00223601400:514')
    expect(result.coordinatorIndex)
      .be.a('number')
      .to.equal(0)
    expect(result.playerIndex)
      .be.a('number')
      .to.equal(1)
    expect(result.members)
      .be.a('array')
  })

  it('playerUrlHost used and ok ', async () => {
    let groupData = TEST_DATA_ZONEGROUP['3Player_1Group_Coordinator_Kitchen'].result
    groupData = groupData.map(group => {
      group = group.map(member => {
        member.urlObject = new URL(member.urlObject)
        return member
      })
      return group
    })
    const playerUrlHost = '192.168.178.36' // old ip
    const playerName = '' // not used
    const result = await extractGroup(playerUrlHost, groupData, playerName)
    expect(result)
      .be.a('object')
    expect(result.groupId)
      .be.a('string')
      .to.equal('RINCON_5CAAFD00223601400:514')
    expect(result.coordinatorIndex)
      .be.a('number')
      .to.equal(0)
    expect(result.playerIndex)
      .be.a('number')
      .to.equal(2)
    expect(result.members)
      .be.a('array')
  })
  
  it('playerName number throws error not found', async () => {
    const GROUP_3PLAYER = TEST_DATA_ZONEGROUP['3Player_1Group_Coordinator_Kitchen'].result
    const playerUrlHost = FRITZBOX_IP
    const groupData = GROUP_3PLAYER
    const playerName = 'xxxxxx'
    await extractGroup(playerUrlHost, groupData, playerName)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('nrcsp: could not find given player in any group')
      })
  })

  it('playerUrlHost throws error not found', async () => {
    const GROUP_3PLAYER = TEST_DATA_ZONEGROUP['3Player_1Group_Coordinator_Kitchen'].result
    const playerUrlHost = FRITZBOX_IP
    const groupData = GROUP_3PLAYER
    const playerName = '' // not used
    await extractGroup(playerUrlHost, groupData, playerName)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('nrcsp: could not find given player in any group')
      })
  })

})

describe('validatedGroupProperties function', function () {
  it('all missing will use defaults', async () => {
    const msg = {}
    const result = await validatedGroupProperties(msg)
    expect(result.playerName)
      .be.a('string')
      .to.equal('')
    expect(result.volume)
      .be.a('number')
      .to.equal(-1)
    expect(result.sameVolume)
      .be.a('boolean')
      .to.equal(true)
    expect(result.clearQueue)
      .be.a('boolean')
      .to.equal(true)
  })

  it('all undefined will use defaults', async () => {
    const msg = {}
    msg.playerName = undefined
    msg.volume = undefined
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    const result = await validatedGroupProperties(msg)
    expect(result.playerName)
      .be.a('string')
      .to.equal('')
    expect(result.volume)
      .be.a('number')
      .to.equal(-1)
    expect(result.sameVolume)
      .be.a('boolean')
      .to.equal(true)
    expect(result.clearQueue)
      .be.a('boolean')
      .to.equal(true)
  })

  it('all NaN will use defaults', async () => {
    // TODO NaN should throw error in the future
    const msg = {}
    msg.playerName = NaN
    msg.volume = NaN
    msg.sameVolume = NaN
    msg.clearQueue = NaN
    const result = await validatedGroupProperties(msg)
    expect(result.playerName)
      .be.a('string')
      .to.equal('')
    expect(result.volume)
      .be.a('number')
      .to.equal(-1)
    expect(result.sameVolume)
      .be.a('boolean')
      .to.equal(true)
    expect(result.clearQueue)
      .be.a('boolean')
      .to.equal(true)
  })

  it('all Infinite will use defaults', async () => {
    // TODO infinite should throw error in the future
    const msg = {}
    msg.playerName = Infinity
    msg.volume = Infinity
    msg.sameVolume = Infinity
    msg.clearQueue = Infinity
    const result = await validatedGroupProperties(msg)
    expect(result.playerName)
      .be.a('string')
      .to.equal('')
    expect(result.volume)
      .be.a('number')
      .to.equal(-1)
    expect(result.sameVolume)
      .be.a('boolean')
      .to.equal(true)
    expect(result.clearQueue)
      .be.a('boolean')
      .to.equal(true)
  })

  it('all null will use defaults', async () => {
    // TODO null should throw error in the future
    const msg = {}
    msg.playerName = null
    msg.volume = null
    msg.sameVolume = null
    msg.clearQueue = null
    const result = await validatedGroupProperties(msg)
    expect(result.playerName)
      .be.a('string')
      .to.equal('')
    expect(result.volume)
      .be.a('number')
      .to.equal(-1)
    expect(result.sameVolume)
      .be.a('boolean')
      .to.equal(true)
    expect(result.clearQueue)
      .be.a('boolean')
      .to.equal(true)
  })

  it('playerName ok - all other use default', async () => {
    const msg = {}
    msg.playerName = 'MeinPlayer'
    msg.volume = undefined
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    const result = await validatedGroupProperties(msg)
    expect(result.playerName)
      .be.a('string')
      .to.equal('MeinPlayer')
    expect(result.volume)
      .be.a('number')
      .to.equal(-1)
    expect(result.sameVolume)
      .be.a('boolean')
      .to.equal(true)
    expect(result.clearQueue)
      .be.a('boolean')
      .to.equal(true)
  })

  it('playerName empty throws error', async () => {
    const msg = {}
    msg.playerName = ''
    msg.volume = undefined
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        // eslint-disable-next-line max-len
        }).to.throw('nrcsp: player name (playerName) >> wrong syntax. Regular expr. - see documentation')
      })
  })

  it('playerName number throws error', async () => {
    const msg = {}
    msg.playerName = 9
    msg.volume = undefined
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        // eslint-disable-next-line max-len
        }).to.throw('nrcsp: player name (playerName) is not type string')
      })
  })

  it('playerName boolean throws error', async () => {
    const msg = {}
    msg.playerName = true
    msg.volume = undefined
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        // eslint-disable-next-line max-len
        }).to.throw('nrcsp: player name (playerName) is not type string')
      })
  })

  it('playerName array throws error', async () => {
    const msg = {}
    msg.playerName = ['hy']
    msg.volume = undefined
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        // eslint-disable-next-line max-len
        }).to.throw('nrcsp: player name (playerName) is not type string')
      })
  })
  
  it('playerName ok, volume number 10 - all other use default', async () => {
    const msg = {}
    msg.playerName = 'MeinPlayer'
    msg.volume = 10
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    const result = await validatedGroupProperties(msg)
    expect(result.playerName)
      .be.a('string')
      .to.equal('MeinPlayer')
    expect(result.volume)
      .be.a('number')
      .to.equal(10)
    expect(result.sameVolume)
      .be.a('boolean')
      .to.equal(true)
    expect(result.clearQueue)
      .be.a('boolean')
      .to.equal(true)
  })

  it('playerName ok, volume string 10 - all other use default', async () => {
    const msg = {}
    msg.playerName = 'MeinPlayer'
    msg.volume = '10'
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    const result = await validatedGroupProperties(msg)
    expect(result.playerName)
      .be.a('string')
      .to.equal('MeinPlayer')
    expect(result.volume)
      .be.a('number')
      .to.equal(10)
    expect(result.sameVolume)
      .be.a('boolean')
      .to.equal(true)
    expect(result.clearQueue)
      .be.a('boolean')
      .to.equal(true)
  })

  it('playerName ok, volume is boolean throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = true
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        // eslint-disable-next-line max-len
        }).to.throw('nrcsp: volume (msg.volume) is not type string/number')
      })
  })

  it('playerName ok, volume array throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = ['x']
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        // eslint-disable-next-line max-len
        }).to.throw('nrcsp: volume (msg.volume) is not type string/number')
      })
  })

  it('playerName ok, volume number -1 throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = -1
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('volume (msg.volume) >>-1 is out of range')
      })
  })

  it('playerName ok, volume number 101 throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = 101
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('volume (msg.volume) >>101 is out of range')
      })
  })

  it('playerName ok, volume string -1 throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = '-1'
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('volume (msg.volume) >>-1 is out of range')
      })
  })
  it('playerName ok, volume string 101 throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = '101'
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('volume (msg.volume) >>101 is out of range')
      })
  })

  it('playerName ok, volume string 1.5 throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = 1.5
    msg.sameVolume = undefined
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('nrcsp: volume (msg.volume) is not integer')
      })
  })

  it('playerName ok, volume number 10, sameVolume true all other use default', async () => {
    const msg = {}
    msg.playerName = 'MeinPlayer'
    msg.volume = 10
    msg.sameVolume = false
    msg.clearQueue = undefined
    const result = await validatedGroupProperties(msg)
    expect(result.playerName)
      .be.a('string')
      .to.equal('MeinPlayer')
    expect(result.volume)
      .be.a('number')
      .to.equal(10)
    expect(result.sameVolume)
      .be.a('boolean')
      .to.equal(false)
    expect(result.clearQueue)
      .be.a('boolean')
      .to.equal(true)
  })

  it('playerName ok, volume 10, sameVolume string throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = 10
    msg.sameVolume = 'true'
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('nrcsp:: sameVolume (msg.sameVolume) is not boolean')
      })
  })

  it('playerName ok, volume 10, same volume array throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = 10
    msg.sameVolume = ['x']
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('nrcsp:: sameVolume (msg.sameVolume) is not boolean')
      })
  })

  it('playerName ok, volume 10, samevolume number 0 throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = 10
    msg.sameVolume = 0
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('nrcsp:: sameVolume (msg.sameVolume) is not boolean')
      })
  })

  it('playerName ok, volume not given, sameVolume true throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = undefined
    msg.sameVolume = true
    msg.clearQueue = undefined
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('nrcsp:: sameVolume (msg.sameVolume) is true but msg.volume is not specified')
      })
  })

  it('playerName ok, volume number 10, sameVolume true, clearQueue false', async () => {
    const msg = {}
    msg.playerName = 'MeinPlayer'
    msg.volume = 10
    msg.sameVolume = false
    msg.clearQueue = false
    const result = await validatedGroupProperties(msg)
    expect(result.playerName)
      .be.a('string')
      .to.equal('MeinPlayer')
    expect(result.volume)
      .be.a('number')
      .to.equal(10)
    expect(result.sameVolume)
      .be.a('boolean')
      .to.equal(false)
    expect(result.clearQueue)
      .be.a('boolean')
      .to.equal(false)
  })

  it('playerName ok, volume 10, sameVolume true, cleaQueue string thows error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = 10
    msg.sameVolume = true
    msg.clearQueue = 'true'
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('nrcsp:: clearQueue (msg.cleanQueue) is not boolean')
      })
  })

  it('playerName ok, volume 10, same volume true, cleaQueue array throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = 10
    msg.sameVolume = true
    msg.clearQueue = ['X']
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('nrcsp:: clearQueue (msg.cleanQueue) is not boolean')
      })
  })

  it('playerName ok, volume 10, samevolume true, clearQueue number 0 throws error', async () => {
    const msg = {}
    msg.playerName = PLAYERNAME_KITCHEN
    msg.volume = 10
    msg.sameVolume = true
    msg.clearQueue = 0
    await validatedGroupProperties(msg)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw('nrcsp:: clearQueue (msg.cleanQueue) is not boolean')
      })
  })

})

describe('isOnlineSonosPlayer function', function () {
  
  it('wrong syntax returns false', async () => {
    const playerUrl = new URL('http://192.168.17837:1400')
    const timeout = 500
    const result = await isOnlineSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
 
  it('fritzbox returns false', async () => {
    const playerUrl = new URL('http://192.168.178.1:1400')
    const timeout = 500
    const result = await isOnlineSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Play:5 returns true', async () => {
    const playerUrl = new URL(PLAY5)
    const timeout = 500
    const result = await isOnlineSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('NAS returns false', async () => {
    const playerUrl = new URL(SYNOLOGY_INVALID)
    const timeout = 500
    const result = await isOnlineSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Play:1 returns false if switched off', async () => {
    const playerUrl = new URL(PLAY1)
    const timeout = 500
    const result = await isOnlineSonosPlayer(playerUrl, timeout)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

})

describe('getDeviceInfo function', function () { 
  this.timeout(5000)

  it('kitchen returns id RINCON_5CAAFD00223601400', async () => {
    const playerUrl = new URL(PLAY5)
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.id)
      .be.a('string')
      .equal('RINCON_5CAAFD00223601400')
  })

  it('kitchen has line in', async () => {
    const playerUrl = new URL(PLAY5)
    const timeout = 5000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities).to.include('LINE_IN')
  })
  
  it('living returns id RINCON_949F3EC13B9901400', async () => {
    const playerUrl = new URL(BEAM)
    const timeout = 5000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.id)
      .be.a('string')
      .equal('RINCON_949F3EC13B9901400')
  })

  it('living has tv', async () => {
    const playerUrl = new URL(BEAM)
    const timeout = 5000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities)
      .to.include('HT_PLAYBACK')
  })

  it('bath has no tv', async () => {
    const playerUrl = new URL(BATH)
    const timeout = 5000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities).to.not.include('HT_PLAYBACK')
  })

  it('bath has line in', async () => {
    const playerUrl = new URL(BATH)
    const timeout = 5000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities).to.include('LINE_IN')
  })

  it('bath with too small time out throws error', async () => {
    const playerUrl = new URL(BATH)
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
    const timeout = 4000
    try {
      await getDeviceInfo(playerUrl, timeout)  
    } catch (error) {
      expect(error.message).equal('connect ECONNREFUSED 192.168.178.1:1400')
    }
  })

})

describe('matchSerialUuid function', function () {
  
  it('equal provides true', async () => {
    const serial = '00-0E-58-FE-3A-EA:5'
    const uuid = 'RINCON_000E58FE3AEA01400'
    const result = await matchSerialUuid(serial, uuid)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('not same provides false', async () => {
    const serial = '94-9F-3E-C1-3B-99:8'
    const uuid = 'RINCON_000E58FE3AEA01400'
    const result = await matchSerialUuid(serial, uuid)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
})

describe('parseZoneGroupToArray function', function () { 
  
  // deep comparison not possible as urlObject is object or string
  it('3Player-1Group-CoKitchen - length and coordinator name', async () => {
    const TEST_1 = TEST_DATA_ZONEGROUP['3Player_1Group_Coordinator_Kitchen']
    const result = await parseZoneGroupToArray(TEST_1.ZoneGroupState)
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
    const TEST = TEST_DATA_ZONEGROUP['3Player_1Group_Coordinator_Living']
    const result = await parseZoneGroupToArray(TEST.ZoneGroupState)
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
    const TEST = TEST_DATA_ZONEGROUP['3Player_3Groups']
    const result = await parseZoneGroupToArray(TEST.ZoneGroupState)
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
    const TEST = TEST_DATA_ZONEGROUP['1Player']
    const result = await parseZoneGroupToArray(TEST.ZoneGroupState)
    expect(result.length) // number of groups
      .to.equal(TEST.result.length)
    expect(result[0].length)
      .to.equal(TEST.result[0].length)
    expect(result[0][0].playerName)
      .be.a('string')
      .equal(TEST.result[0][0].playerName)
  })

  it('1Player-name39 - length and playerName string', async () => {
    const TEST = TEST_DATA_ZONEGROUP['1Player-name-39']
    const result = await parseZoneGroupToArray(TEST.ZoneGroupState)
    expect(result.length) // number of groups
      .to.equal(TEST.result.length)
    expect(result[0].length)
      .to.equal(TEST.result[0].length)
    expect(result[0][0].playerName)
      .be.a('string')
      .equal(TEST.result[0][0].playerName)
  })

  it('4Player-2Groups - length and Coordinator', async () => {
    const TEST = TEST_DATA_ZONEGROUP['4Player-2Group-CoKitchen-CoBath']
    const result = await parseZoneGroupToArray(TEST.ZoneGroupState)
    expect(result.length) // number of groups
      .to.equal(TEST.result.length)
    expect(result[0].length)
      .to.equal(TEST.result[0].length)
    expect(result[1].length)
      .to.equal(TEST.result[1].length)
    expect(result[0][0].playerName)
      .be.a('string')
      .equal('Küche') // old testdata
    expect(result[1][0].playerName)
      .be.a('string')
      .equal('Bad') // old testdata
    
  })
})

describe('guessProcessingType function', function () {

  it('audiobroadcast means stream ', async () => {
    const upnpClass = 'object.item.audioItem.audioBroadcast'
    const result = await guessProcessingType(upnpClass)
    expect(result)
      .be.a('string')
      .equal('stream')
  })

  it('musicTack provides queue', async () => {
    const upnpClass = 'object.item.audioItem.musicTrack'
    const result = await guessProcessingType(upnpClass)
    expect(result)
      .be.a('string')
      .equal('queue')
  })

  it('nonsense provides queue', async () => {
    const upnpClass = 'xxxx'
    const result = await guessProcessingType(upnpClass)
    expect(result)
      .be.a('string')
      .equal('queue')
  })
})

describe('parseAlarmsToArray function', function () {
  
  it('no alarms means empty array ', async () => {
    // eslint-disable-next-line max-len
    const xmlIn = '&lt;Alarms&gt;&lt;/Alarms&gt;'
    const result = await parseAlarmsToArray(xmlIn)
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .equal(0)
  })

  it('1 alarms means array of length 1 ', async () => {
    // eslint-disable-next-line max-len
    const xmlIn = '&lt;Alarms&gt;&lt;Alarm ID=&quot;20&quot; StartTime=&quot;07:00:00&quot; Duration=&quot;02:00:00&quot; Recurrence=&quot;DAILY&quot; Enabled=&quot;1&quot; RoomUUID=&quot;RINCON_949F3EC13B9901400&quot; ProgramURI=&quot;x-rincon-buzzer:0&quot; ProgramMetaData=&quot;&quot; PlayMode=&quot;SHUFFLE&quot; Volume=&quot;25&quot; IncludeLinkedZones=&quot;0&quot;/&gt;&lt;/Alarms&gt;'
    const result = await parseAlarmsToArray(xmlIn)
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .equal(1)
  })

  it('2 alarms means array of 2 ', async () => {
    // eslint-disable-next-line max-len
    const xmlIn = '&lt;Alarms&gt;&lt;Alarm ID=&quot;20&quot; StartTime=&quot;07:00:00&quot; Duration=&quot;02:00:00&quot; Recurrence=&quot;DAILY&quot; Enabled=&quot;1&quot; RoomUUID=&quot;RINCON_949F3EC13B9901400&quot; ProgramURI=&quot;x-rincon-buzzer:0&quot; ProgramMetaData=&quot;&quot; PlayMode=&quot;SHUFFLE&quot; Volume=&quot;25&quot; IncludeLinkedZones=&quot;0&quot;/&gt;&lt;Alarm ID=&quot;21&quot; StartTime=&quot;07:00:00&quot; Duration=&quot;02:00:00&quot; Recurrence=&quot;DAILY&quot; Enabled=&quot;1&quot; RoomUUID=&quot;RINCON_000E58FE3AEA01400&quot; ProgramURI=&quot;x-rincon-buzzer:0&quot; ProgramMetaData=&quot;&quot; PlayMode=&quot;SHUFFLE&quot; Volume=&quot;25&quot; IncludeLinkedZones=&quot;1&quot;/&gt;&lt;/Alarms&gt;'
    const result = await parseAlarmsToArray(xmlIn)
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .equal(2)
    expect(result[0].ID)
      .be.a('string')
      .equal('20')
    expect(result[1].ID)
      .be.a('string')
      .equal('21')
  })
})