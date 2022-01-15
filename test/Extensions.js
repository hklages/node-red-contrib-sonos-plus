// async/await syntax makes plugins such chai-as-promised obsolete
// Passing lambdas (or arrow functions) to Mocha is discouraged therefore we do:
// describe('xxxxx', function(){}) instead of describe('xxxxx', () => {})
// That makes the this.timeout work!

// These tests only work in my specific environment
// Using http://192.168.178.51:1400 a SONOS Play:5
// using http://192.168.178.54:1400 a SONOS Play:1 usually switched off
// using http://192.168.178.53:1400 a SONOS Play:3
// using http://192.168.178.15:1400 a Synology NAS

const { decideCreateNodeOn, getDeviceInfo, matchSerialUuid, parseZoneGroupToArray,
  parseBrowseToArray, guessProcessingType, validatedGroupProperties, extractGroup,
  // eslint-disable-next-line max-len
  parseAlarmsToArray, getMutestate, getPlaybackstate, getVolume, setVolume, selectTrack, play, getPositionInfo
} = require('../src/Extensions.js')

const { SonosDevice } = require('@svrooij/sonos/lib')

const PLAY5 = 'http://192.168.178.51:1400'
const BEAM = 'http://192.168.178.53:1400'
const PLAY1 = 'http://192.168.178.54:1400'
const BATH = 'http://192.168.178.52:1400'
const SYNOLOGY_INVALID = 'http://192.168.178.15:1400' // is not a sonos player

const FRITZBOX_IP = '192.168.178.1'
const PLAY5_IP = '192.168.178.51'

const SHADE_SONG = 'x-rincon-playlist:RINCON_000E58FE3AEA01400#A:ALBUM/Diamond%20Life'

const PLAYERNAME_KITCHEN = 'SonosKueche'

const { describe, it } = require('mocha')
const { expect } = require('chai')

describe('executeV6 usage', function () {
  
  const tsPlayer = new SonosDevice(PLAY5_IP)  
  const playerUrlObject = new URL(`http://${PLAY5_IP}:1400`)

  it('method getMutestate on ', async () => {
    // set
    await tsPlayer.GroupRenderingControlService.SetGroupMute({ InstanceID: 0, DesiredMute: true })
    // test
    const result = await getMutestate(playerUrlObject)
    expect(result)
      .be.a('string')
      .to.equal('on')
  })
  it('method getMutestate off ', async () => {
    // set
    await tsPlayer.GroupRenderingControlService.SetGroupMute({ InstanceID: 0, DesiredMute: false })
    // test
    const result = await getMutestate(playerUrlObject)
    expect(result)
      .be.a('string')
      .to.equal('off')
  })

  it('method getPlaybackstate stopped', async () => {
    // set
    await tsPlayer.AVTransportService.Stop({ InstanceID: 0 })
    // test
    const result = await getPlaybackstate(playerUrlObject)
    expect(result)
      .be.a('string')
      .to.equal('stopped')
  })
  it('method getPlaybackstate playing ', async () => {
    // set
    await tsPlayer.AVTransportService.Play({ InstanceID: 0, Speed: '1' })
    // test
    const result = await getPlaybackstate(playerUrlObject)
    expect(result)
      .be.a('string')
      .to.be.oneOf(['playing', 'transitioning'])
  })

  it('getVolume string 0', async () => {
    // set
    await tsPlayer.RenderingControlService.SetVolume({
      InstanceID: 0, Channel: 'Master',
      DesiredVolume: 0
    })
    // test
    const result = await getVolume(playerUrlObject)
    expect(result)
      .be.a('string')
      .to.equal('0')
  })
  it('getVolume string 10 ', async () => {
    // set
    await tsPlayer.RenderingControlService.SetVolume({
      InstanceID: 0, Channel: 'Master',
      DesiredVolume: 10
    })
    // test
    const result = await getVolume(playerUrlObject)
    expect(result)
      .be.a('string')
      .to.equal('10')
  })

  it('getPositionInfo - queue in normal mode album from Sade', async () => {
    // set
    await tsPlayer.
      AddUriToQueue(SHADE_SONG)
    await tsPlayer.Play()
    // test
    const result = await getPositionInfo(playerUrlObject)
    expect(result)
      .be.a('object')
    expect(result.Track)
      .be.a('string')
      .to.equal('1')
    expect(result.TrackDuration)
      .be.a('string')
      .to.equal('0:05:00')
    expect(result.TrackMetaData.startsWith('<DIDL-Lite xmlns:dc='))
      .be.a('boolean')
      .to.equal(true)
    expect(result.TrackURI)
      .be.a('string')
      // eslint-disable-next-line max-len
      .to.equal('x-file-cifs://hkNas/Multimedia/Music/MyMusic/Sade/Diamond%20Life/Sade%20-%20Smooth%20Operator.mp3')
    expect(result.RelTime)
      .be.a('string')
  })

  it('setVolume integer 0', async () => {
    // INFO we set volume and test the result with another function!
    // set
    await setVolume(playerUrlObject, 0)
    // test
    const result = await tsPlayer.RenderingControlService.GetVolume({
      InstanceID: 0,
      Channel: 'Master'
    })
    expect(result.CurrentVolume)
      .to.equal(0)
  })
  it('setVolume integer 10 ', async () => {
    // set
    await setVolume(playerUrlObject, 10)
    // test
    const result = await tsPlayer.RenderingControlService.GetVolume({
      InstanceID: 0,
      Channel: 'Master'
    })
    expect(result.CurrentVolume)
      .to.equal(10)
  })

  it('play ', async () => {
    // INFO we stop, then we start and then test the result with another function!
    // first we stop
    await tsPlayer.AVTransportService.Stop  
    // set
    await play(playerUrlObject)
    // test
    const result = await tsPlayer.AVTransportService.GetTransportInfo({ InstanceID: 0 })
    expect(result.CurrentTransportState)
      .to.be.oneOf(['PLAYING', 'TRANSITIONING'])
  })

  it('selectTrack  4,  prereq queue must be active and at least 4 entries', async () => {
    // INFO we select the track and test the result with another function!
    // set
    const trackNb = 4
    await selectTrack(playerUrlObject, trackNb)
    // test
    const result = await tsPlayer.AVTransportService.GetPositionInfo({
      InstanceID: 0
    })
    expect(result.Track)
      .to.equal(trackNb)
  })
})

describe('extractGroup function', function () {
  const TEST_DATA_ZONEGROUP = require('./testdata-parsezonegroup.json')
  
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

describe('decideCreateNodeOn function', function () {
  
  it('wrong syntax returns false', async () => {
    const playerUrl = new URL('http://192.168.17837:1400')
    const timeout = 500
    const result = await decideCreateNodeOn(playerUrl, timeout, false)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
 
  it('fritzbox returns false', async () => {
    const playerUrl = new URL('http://192.168.178.1:1400')
    const timeout = 500
    const result = await decideCreateNodeOn(playerUrl, timeout, false)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Play:5 returns true', async () => {
    const playerUrl = new URL(PLAY5)
    const timeout = 500
    const result = await decideCreateNodeOn(playerUrl, timeout, false)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('NAS returns false', async () => {
    const playerUrl = new URL(SYNOLOGY_INVALID)
    const timeout = 500
    const result = await decideCreateNodeOn(playerUrl, timeout, false)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Play:1 returns false if switched off', async () => {
    const playerUrl = new URL(PLAY1)
    const timeout = 500
    const result = await decideCreateNodeOn(playerUrl, timeout, false)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Play:1 returns false but that is ignored by option', async () => {
    const playerUrl = new URL(PLAY1)
    const timeout = 500
    const result = await decideCreateNodeOn(playerUrl, timeout, true)
    expect(result)
      .be.a('boolean')
      .equal(true)
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
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities).to.include('LINE_IN')
  })

  it('living returns id RINCON_949F3EC13B9901400', async () => {
    const playerUrl = new URL(BEAM)
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.id)
      .be.a('string')
      .equal('RINCON_949F3EC13B9901400')
  })

  it('living has tv', async () => {
    const playerUrl = new URL(BEAM)
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities)
      .to.include('HT_PLAYBACK')
  })

  it('bath has no tv', async () => {
    const playerUrl = new URL(BATH)
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities).to.not.include('HT_PLAYBACK')
  })

  it('bath has no line in', async () => {
    const playerUrl = new URL(BATH)
    const timeout = 2000
    const result = await getDeviceInfo(playerUrl, timeout)
    expect(result.device.capabilities).to.not.include('LINE_IN')
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
  
  const TEST_DATA_ZONEGROUP =  require('./testdata-parsezonegroup.json')
  
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

describe('parseBrowseToArray function', function () {
  
  const TEST_DATA_BROWSE = require('./testdata-parseBrowse.json')

  // keep in mind that get mysonos appends SONNS playlists at the end. 
  // for testing they have to be removed from the result array!
  it('mysonos with out playlist 42 entries - array, length, some items', async () => {
    const TEST = TEST_DATA_BROWSE['mysonos-42entries']
    const result = await parseBrowseToArray(TEST.browseOut, 'item')
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .to.equal(TEST.result.length)
    expect(result[0].title)
      .be.a('string')
      .equal('1. HERZ KRAFT WERKE (Deluxe Version)')
      .to.not.be.null
      .to.not.be.undefined
    expect(result[0].id)
      .be.a('string')
      .equal('FV:2/139')
      .to.not.be.null
      .to.not.be.undefined
    expect(result[0].metadata)
      .be.a('string')
    expect(result[0].artUri)
      .be.a('string')
    expect(result[0].uri)
      .be.a('string')
    expect(result[0])
      .deep.eq(result[0])
    expect(result[40])
      .deep.eq(result[40])
  })

  it('mysonos without playlist 1 entry - array, length, some items', async () => {
    const TEST = TEST_DATA_BROWSE['mysonos-1entry']
    const result = await parseBrowseToArray(TEST.browseOut, 'item')
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .to.equal(TEST.result.length)
    expect(result[0].title)
      .be.a('string')
      .equal('x (Deluxe Edition)')
      .to.not.be.null
      .to.not.be.undefined
    expect(result[0].id)
      .be.a('string')
      .equal('FV:2/180')
      .to.not.be.null
      .to.not.be.undefined
    expect(result[0].metadata)
      .be.a('string')
    expect(result[0].artUri)
      .be.a('string')
    expect(result[0].uri)
      .be.a('string')
    expect(result[0])
      .deep.eq(result[0])
  })

  it('sonos queue 0 entries - array & length', async () => {
    const TEST = TEST_DATA_BROWSE['queue-0entries']
    const result = await parseBrowseToArray(TEST.browseOut, 'item')
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .to.equal(TEST.result.length)
  })

  it('sonos queue 1 entry - array, length, first item', async () => {
    const TEST = TEST_DATA_BROWSE['queue-1entry']
    const result = await parseBrowseToArray(TEST.browseOut, 'item')
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .to.equal(TEST.result.length)
    expect(result[0].title)
      .be.a('string')
    expect(result[0].id)
      .be.a('string')
    expect(result[0].processingType)
      .be.a('string')
      .equal('queue')
    expect(result[0])
      .deep.eq(result[0])
  })

  it('sonos queue 24 entry - array, length, some items', async () => {
    const TEST = TEST_DATA_BROWSE['queue-24entries']
    const result = await parseBrowseToArray(TEST.browseOut, 'item')
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .to.equal(TEST.result.length)
    expect(result[10].title)
      .be.a('string')
    expect(result[10].id)
      .be.a('string')
    expect(result[10].processingType)
      .be.a('string')
      .equal('queue')
    expect(result[5])
      .deep.eq(result[5])
    expect(result[23])
      .deep.eq(result[23])
  })

  it('sonos playlist 0 entries - array & length', async () => {
    const TEST = TEST_DATA_BROWSE['sonosplaylist-0entries']
    const result = await parseBrowseToArray(TEST.browseOut, 'container')
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .to.equal(TEST.result.length)
  })

  it('sonos playlist  1 entry - array, length, first item', async () => {
    const TEST = TEST_DATA_BROWSE['sonosplaylist-1entry']
    const result = await parseBrowseToArray(TEST.browseOut, 'container')
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .to.equal(TEST.result.length)
    expect(result[0].title)
      .be.a('string')
    expect(result[0].id)
      .be.a('string')
    expect(result[0].processingType)
      .be.a('string')
      .equal('queue')
    expect(result[0])
      .deep.eq(result[0])
  })

  it('ml album  0 entries - array & length', async () => {
    const TEST = TEST_DATA_BROWSE['mlalbum-0entries']
    const result = await parseBrowseToArray(TEST.browseOut, 'container')
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .to.equal(TEST.result.length)
  })

  it('ml album  1 entry - array, length, first item', async () => {
    const TEST = TEST_DATA_BROWSE['mlalbum-1entry']
    const result = await parseBrowseToArray(TEST.browseOut, 'container')
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .to.equal(TEST.result.length)
    expect(result[0].title)
      .be.a('string')
    expect(result[0].id)
      .be.a('string')
    expect(result[0].processingType)
      .be.a('string')
      .equal('queue')
    expect(result[0])
      .deep.eq(result[0])
  })

  it('ml album  6 entries - array, length, some items', async () => {
    const TEST = TEST_DATA_BROWSE['mlalbum-6entries']
    const result = await parseBrowseToArray(TEST.browseOut, 'container')
    expect(result)
      .be.a('array')
    expect(result.length) // number of items
      .to.equal(TEST.result.length)
    expect(result[3].title)
      .be.a('string')
    expect(result[3].id)
      .be.a('string')
    expect(result[3].processingType)
      .be.a('string')
      .equal('queue')
    expect(result[4])
      .deep.eq(result[4])
    expect(result[5])
      .deep.eq(result[5])
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

  it('1 alarms means array of lenght 1 ', async () => {
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