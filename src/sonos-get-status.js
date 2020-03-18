const {
  REGEX_IP,
  REGEX_SERIAL,
  PLAYER_WITH_TV,
  failure,
  warning,
  discoverSonosPlayerBySerial,
  isValidProperty,
  isValidPropertyNotEmptyString,
  isTruthyAndNotEmptyString,
  isTruthy,
  success
} = require('./Helper.js')

const { ACTIONS_TEMPLATES, getCmd, getGroupMembersData } = require('./Sonos-Commands.js')
const { Sonos } = require('sonos')

module.exports = function (RED) {
  'use strict'

  /**  Create Get Status Node and subscribe to messages.
   * @param  {object} config current node configuration data
   */
  function SonosGetStatusNode (config) {
    RED.nodes.createNode(this, config)
    const sonosFunction = 'setup subscribe'

    const node = this
    const configNode = RED.nodes.getNode(config.confignode)

    if (!((isValidProperty(configNode, ['ipaddress']) && REGEX_IP.test(configNode.ipaddress)) ||
        (isValidProperty(configNode, ['serialnum']) && REGEX_SERIAL.test(configNode.serialnum)))) {
      failure(node, null, new Error('n-r-c-s-p: invalid config node - missing ip or serial number'), sonosFunction)
      return
    }

    // clear node status
    node.status({})
    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received')

      // if ip address exist use it or get it via discovery based on serialNum
      if (isValidProperty(configNode, ['ipaddress']) && REGEX_IP.test(configNode.ipaddress)) {
        node.debug('using IP address of config node')
        processInputMsg(node, msg, configNode.ipaddress, configNode.serialnum)
      } else {
        // have to get ip address via disovery with serial numbers
        warning(node, sonosFunction, 'No ip address', 'Providing ip address is recommended')
        if (isValidProperty(configNode, ['serialnum']) && REGEX_SERIAL.test(configNode.serialnum)) {
          discoverSonosPlayerBySerial(node, configNode.serialnum, (err, ipAddress) => {
            if (err) {
              failure(node, msg, new Error('n-r-c-s-p: discovery failed'), sonosFunction)
              return
            }
            if (ipAddress === null) {
              failure(node, msg, new Error('n-r-c-s-p: could not find any player by serial'), sonosFunction)
            } else {
              // setting of nodestatus is done in following call handelIpuntMessage
              node.debug('Found sonos player')
              processInputMsg(node, msg, ipAddress, configNode.serialnum)
            }
          })
        } else {
          failure(node, msg, new Error('n-r-c-s-p: invalid config node - invalid serial'), sonosFunction)
        }
      }
    })
  }

  /**  Validate sonos player and input message then dispatch further.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {string} ipaddress IP address of sonos player
   */
  function processInputMsg (node, msg, ipaddress) {
    const sonosFunction = 'handle input msg'
    const sonosPlayer = new Sonos(ipaddress)

    if (!isTruthyAndNotEmptyString(sonosPlayer)) {
      failure(node, msg, new Error('n-r-c-s-p: undefined sonos player'), sonosFunction)
      return
    }
    if (!isTruthyAndNotEmptyString(sonosPlayer.host) ||
      !isTruthyAndNotEmptyString(sonosPlayer.port)) {
      failure(node, msg, new Error('n-r-c-s-p: missing ip or port'), sonosFunction)
      return
    }
    sonosPlayer.baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`

    // Check msg.payload. Store lowercase version in command
    if (!isTruthyAndNotEmptyString(msg.payload)) {
      failure(node, msg, new Error('n-r-c-s-p: undefined payload', sonosFunction))
      return
    }

    let command = String(msg.payload)
    command = command.toLowerCase()

    // dispatch
    if (command === 'get_basics') {
      getBasicsV1(node, msg, sonosPlayer)
    } else if (command === 'get_state') {
      getPlayerStateV3(node, msg, sonosPlayer)
    } else if (command === 'get_volume') {
      getPlayerVolumeV3(node, msg, sonosPlayer)
    } else if (command === 'get_muted') {
      getPlayerMutedV3(node, msg, sonosPlayer)
    } else if (command === 'get_name') {
      getPlayerNameV3(node, msg, sonosPlayer)
    } else if (command === 'get_led') {
      getPlayerLedStatus(node, msg, sonosPlayer)
    } else if (command === 'get_properties') {
      getPlayerProperties(node, msg, sonosPlayer)
    } else if (command === 'get_songmedia') {
      getPlayerSongMediaV1(node, msg, sonosPlayer)
    } else if (command === 'get_songinfo') {
      getPlayerCurrentSongV1(node, msg, sonosPlayer)
    } else if (command === 'get_mediainfo') {
      getMediaInfoV1(node, msg, sonosPlayer)
    } else if (command === 'get_positioninfo') {
      getPositionInfoV1(node, msg, sonosPlayer)
    } else if (command === 'get_groups') {
      getGroupsInfo(node, msg, sonosPlayer)
    } else if (command === 'get_eq') {
      getEQ(node, msg, sonosPlayer)
    } else if (command === 'get_crossfade') {
      getCrossfadeMode(node, msg, sonosPlayer)
    } else if (command === 'get_loudness') {
      getLoudnessMode(node, msg, sonosPlayer)
    } else if (command === 'get_sleeptimer') {
      getRemainingSleepTimerDuration(node, msg, sonosPlayer)
    } else if (command === 'test_connected') {
      testConnected(node, msg, sonosPlayer)
      // depreciated commands
    } else if (command === 'get_mysonos') {
      getMySonosAll(node, msg, sonosPlayer)
    } else if (command === 'lab') {
      labFunction(node, msg, sonosPlayer)
    } else {
      warning(
        node,
        sonosFunction,
        'dispatching commands - invalid command',
        'command-> ' + JSON.stringify(command)
      )
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /** Get the SONOS basic data and output to msg.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output msg: state, volume, volumeNormalized, muted, name, group
   * This command will send several api calls and combine the results.
   */
  function getBasicsV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get basics'
    let state
    let volume
    let normalizedVolume
    let muted
    let sonosName
    let sonosGroup

    sonosPlayer.getCurrentState()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player state received')
        }
        state = response
        return true
      })
      .then(() => {
        return sonosPlayer.getVolume()
      })
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player volume received')
        }
        volume = response
        normalizedVolume = response / 100.0
        return true
      })
      .then(() => {
        return sonosPlayer.getMuted()
      })
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player muted state received')
        }
        muted = response
        return true
      })
      .then(() => {
        return sonosPlayer.getName()
      })
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player name received')
        }
        sonosName = response
        return true
      })
      .then(() => {
        return sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes()
      })
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined zone group attributes received')
        }
        sonosGroup = response
        return true
      })
      .then(() => {
        msg.state = state
        msg.volume = volume
        msg.volumeNormalized = normalizedVolume
        msg.muted = muted
        msg.name = sonosName
        msg.group = sonosGroup
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get the sonos player state and outputs.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output changes msg.payload
   */
  function getPlayerStateV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player state'

    sonosPlayer.getCurrentState()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player state received')
        }
        node.debug('got valid player state')
        msg.payload = response
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get the sonos player volume and outputs.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output changes msg.payload
   */
  function getPlayerVolumeV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player volume'

    sonosPlayer.getVolume()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response) || isNaN(response)) {
          throw new Error('n-r-c-s-p: undefined player volume received')
        }
        if (!Number.isInteger(response)) {
          throw new Error('n-r-c-s-p: invalid volume received')
        }
        node.debug('got valid player volume')
        msg.payload = response
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get the sonos player muted state and outputs.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output changes msg.payload
   */
  function getPlayerMutedV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player muted state'

    sonosPlayer.getMuted()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined mute state received')
        }
        node.debug('got valid mute state')
        msg.payload = response
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get the sonos player name and outputs.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output changes msg.payload
   */
  function getPlayerNameV3 (node, msg, sonosPlayer) {
    const sonosFunction = 'get player name'
    sonosPlayer.getName()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player name received')
        }
        node.debug('got valid player name')
        msg.payload = response
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get the sonos player LED light status and outputs to payload.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output changes msg.payload in On or Off
   */
  function getPlayerLedStatus (node, msg, sonosPlayer) {
    const sonosFunction = 'get LED status'
    sonosPlayer.getLEDState()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player properties received')
        }
        // should be On or Off
        node.debug('got valid LED status')
        msg.payload = response
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get the sonos player properties and outputs to payload.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output changes msg.payload
   */
  function getPlayerProperties (node, msg, sonosPlayer) {
    const sonosFunction = 'get player properties'
    sonosPlayer.deviceDescription()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player properties received')
        }
        node.debug('got valid group attributes')
        msg.uuid = response.UDN.substring('uuid:'.length)
        msg.payload = response
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get the sonos player current song, media and position and outputs.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output msg: artist, title, albumArtURL, queueActivated, song, media and position
   * This command send serveral api requests and combines them.
   */
  function getPlayerSongMediaV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get songmedia'

    let artist = 'unknown' // as default
    let title = 'unknown' // as default
    let albumArtURL = ''

    let suppressWarnings = false // default
    if (!isTruthyAndNotEmptyString(msg.suppressWarnings)) {
      suppressWarnings = false
    } else {
      if (typeof msg.suppressWarnings === 'boolean') {
        suppressWarnings = msg.suppressWarnings
      } else {
        failure(node, msg, new Error('n-r-c-s-p: msg.suppressWarning should be of type boolean'), sonosFunction)
        return
      }
    }
    sonosPlayer.currentTrack()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined current song received')
        }
        msg.song = response
        // modify albumArtURL property
        if (
          typeof response.albumArtURI === 'undefined' ||
          response.albumArtURI === null ||
          (typeof response.albumArtURI === 'number' && isNaN(response.albumArtURI)) ||
          response.albumArtURI === ''
        ) {
          // TuneIn does not provide AlbumArtURL -so we continue
        } else {
          node.debug('got valid albumArtURI')
          albumArtURL = sonosPlayer.baseUrl + response.albumArtURI
        }
        // extract artist and title if available V2
        if (
          typeof response.artist === 'undefined' ||
          response.artist === null ||
          (typeof response.artist === 'number' && isNaN(response.artist)) ||
          response.artist === ''
        ) {
          // missing artist: TuneIn provides artist and title in title field
          if (typeof response.title === 'undefined' || response.title === null ||
            (typeof response.title === 'number' && isNaN(response.title)) || response.title === '') {
            if (!suppressWarnings) {
              warning(node, sonosFunction, 'no artist, no title', 'received-> ' + JSON.stringify(response))
            }
            msg.artist = artist
            msg.title = title
            return
          } else {
            if (response.title.indexOf(' - ') > 0) {
              node.debug('could split data to artist and title')
              artist = response.title.split(' - ')[0]
              title = response.title.split(' - ')[1]
            } else {
              if (!suppressWarnings) {
                warning(node, sonosFunction, 'invalid combination artist title received', 'received-> ' + JSON.stringify(response))
              }
              msg.artist = artist
              msg.title = response.title
              return
            }
          }
        } else {
          artist = response.artist
          if (typeof response.title === 'undefined' || response.title === null ||
            (typeof response.title === 'number' && isNaN(response.title)) || response.title === '') {
            // title unknown
          } else {
            title = response.title
            node.debug('got artist and title')
          }
        }
        node.debug('got valid song info')
        // msg.song = response already set before
        msg.albumArtURL = albumArtURL
        msg.artist = artist
        msg.title = title
        return true
      })
      .then(() => {
        return sonosPlayer.avTransportService().GetMediaInfo()
      })
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined media info received')
        }
        if (typeof response.CurrentURI === 'undefined' || response.CurrentURI === null ||
          (typeof response.CurrentURI === 'number' && isNaN(response.CurrentURI)) || response.CurrentURI === '') {
          throw new Error('n-r-c-s-p: undefined CurrentURI received')
        }
        const uri = response.CurrentURI
        msg.queueActivated = uri.startsWith('x-rincon-queue')
        if (uri.startsWith('x-sonosapi-stream:') && uri.includes('sid=254')) {
          const end = uri.indexOf('?sid=254')
          const start = 'x-sonosapi-stream:'.length
          msg.radioId = uri.substring(start, end)
        }
        msg.media = response
        return true
      })
      .then(() => {
        return sonosPlayer.avTransportService().GetPositionInfo()
      })
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined position info received')
        }
        msg.position = response
        return true
      })
      .then(() => {
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get the sonos player current song and outputs.
  * @param  {object} node current node
  * @param  {object} msg incoming message
            msg.suppressWarnings  will suppress warning if exist and true
  * @param  {object} sonosPlayer sonos player object
  * @output msg:  artist, title, albumArtURL and song
  */
  function getPlayerCurrentSongV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get current song'

    let artist = 'unknown' // as default
    let title = 'unknown' // as default
    let albumArtURL = ''

    let suppressWarnings = false // default
    if (!isTruthyAndNotEmptyString(msg.suppressWarnings)) {
      suppressWarnings = false
    } else {
      if (typeof msg.suppressWarnings === 'boolean') {
        suppressWarnings = msg.suppressWarnings
      } else {
        failure(node, msg, new Error('n-r-c-s-p: msg.suppressWarning should be of type boolean'), sonosFunction)
        return
      }
    }

    sonosPlayer.currentTrack()
      .then(response => {
        msg.payload = response
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined current song received')
        }
        // modify albumArtURL property
        if (typeof response.albumArtURI === 'undefined' || response.albumArtURI === null ||
          (typeof response.albumArtURI === 'number' && isNaN(response.albumArtURI)) || response.albumArtURI === '') {
          // TuneIn does not provide AlbumArtURL -so we continure
        } else {
          node.debug('got valid albumArtURI')
          albumArtURL = sonosPlayer.baseUrl + response.albumArtURI
        }
        // extract artist and title if available V2
        if (typeof response.artist === 'undefined' || response.artist === null ||
          (typeof response.artist === 'number' && isNaN(response.artist)) || response.artist === '') {
          // missing artist: TuneIn provides artist and title in title field
          if (typeof response.title === 'undefined' || response.title === null ||
            (typeof response.title === 'number' && isNaN(response.title)) || response.title === '') {
            if (!suppressWarnings) {
              warning(node, sonosFunction, 'no artist, no title', 'received-> ' + JSON.stringify(response))
            }
            msg.artist = artist
            msg.title = title
            return
          } else {
            if (response.title.indexOf(' - ') > 0) {
              node.debug('could split data to artist and title')
              artist = response.title.split(' - ')[0]
              title = response.title.split(' - ')[1]
            } else {
              if (!suppressWarnings) {
                warning(node, sonosFunction, 'invalid combination artist title received', 'received-> ' + JSON.stringify(response))
              }
              msg.artist = artist
              msg.title = response.title
              return
            }
          }
        } else {
          artist = response.artist
          if (typeof response.title === 'undefined' || response.title === null ||
            (typeof response.title === 'number' && isNaN(response.title)) || response.title === '') {
            // title unknown
          } else {
            title = response.title
            node.debug('got artist and title')
          }
        }
        node.debug('got valid song info')
        // msg.payload = response already done above
        msg.albumArtURL = albumArtURL
        msg.artist = artist
        msg.title = title
      })
      .then(() => {
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get the media info and outputs.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output msg: queueActivated, payload = media
   */
  function getMediaInfoV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get media info'

    sonosPlayer.avTransportService().GetMediaInfo()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined media info received')
        }
        if (typeof response.CurrentURI === 'undefined' || response.CurrentURI === null ||
          (typeof response.CurrentURI === 'number' && isNaN(response.CurrentURI)) || response.CurrentURI === '') {
          throw new Error('n-r-c-s-p: undefined CurrentURI received')
        }
        const uri = response.CurrentURI
        msg.queueActivated = uri.startsWith('x-rincon-queue')
        if (uri.startsWith('x-sonosapi-stream:') && uri.includes('sid=254')) {
          const end = uri.indexOf('?sid=254')
          const start = 'x-sonosapi-stream:'.length
          msg.radioId = uri.substring(start, end)
        }
        msg.payload = response
        return true
      })
      .then(() => {
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get the position info and outputs.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output msg: payload = position
   */
  function getPositionInfoV1 (node, msg, sonosPlayer) {
    const sonosFunction = 'get position info'

    sonosPlayer.avTransportService().GetPositionInfo()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined position info received')
        }
        msg.payload = response
        return true
      })
      .then(() => {
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  // depreciated command

  /**  Get list of all My Sonos items.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer Sonos Player
   * change msg.payload to array of all My Sonos items
   */
  function getMySonosAll (node, msg, sonosPlayer) {
    // get list of My Sonos items
    const sonosFunction = 'get my sonos all'
    sonosPlayer.getFavorites()
      .then(response => {
        // validate response
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined getFavorites response received')
        }
        if (typeof response.items === 'undefined' || response.items === null ||
          (typeof response.items === 'number' && isNaN(response.items)) || response.items === '') {
          throw new Error('n-r-c-s-p: undefined favorite list received')
        }
        if (!Array.isArray(response.items)) {
          throw new Error('n-r-c-s-p: did not receive a list')
        }
        const list = response.items
        if (list.length === 0) {
          throw new Error('n-r-c-s-p: no my sonos items found')
        }
        msg.payload = list
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Test SONOS player: reachable true/false
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output changes msg.payload to boolean true otherwise false
   */
  function testConnected (node, msg, sonosPlayer) {
    const sonosFunction = 'test is player reachable'
    sonosPlayer.getCurrentState()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined player state received')
        }
        node.debug('player reachable')
        msg.payload = true
        success(node, msg, sonosFunction)
        return true
      })
      .catch(error => {
        node.debug('test command - error ignored' + JSON.stringify(error))
        let msgShort = 'no further information'
        if (isTruthyAndNotEmptyString(error.code)) {
          if (error.code === 'ECONNREFUSED') {
            msgShort = 'can not connect to player - refused'
          } else if (error.code === 'EHOSTUNREACH') {
            msgShort = 'can not connect to player- unreach'
          } else if (error.code === 'ETIMEDOUT') {
            msgShort = 'can not connect to player- time out'
          }
        }
        node.status({ fill: 'green', shape: 'dot', text: 'test command - ' })
        msg.payload = false
        msg.info = msgShort
        node.send(msg)
      })
  }

  /** getGroupsInfo: get all available data about the topology = group
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer sonos player object
   * @output {object} payload topology and group current group information
   */
  function getGroupsInfo (node, msg, sonosPlayer) {
    const sonosFunction = 'get groups info'

    sonosPlayer.getAllGroups()
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined all group information received')
        }
        node.debug('got valid all group info')
        msg.payload = response
        return true
      })
      .then(() => {
        return sonosPlayer.zoneGroupTopologyService().GetZoneGroupAttributes()
      })
      .then(response => {
        if (!isTruthyAndNotEmptyString(response)) {
          throw new Error('n-r-c-s-p: undefined zone group attributes received')
        }
        node.debug('got zone group attribures info')
        msg.sonosGroup = response
        if (!isTruthy(response.CurrentZoneGroupName)) {
          throw new Error('n-r-c-s-p: undefined CurrentZoneGroupName received')
        }
        if (isTruthyAndNotEmptyString(response.CurrentZoneGroupID)) {
          let coordinatorUuid
          let coordinatorName
          const memberNames = []
          for (var i = 0; i < msg.payload.length; i++) {
            if (msg.payload[i].ID === response.CurrentZoneGroupID) {
              coordinatorUuid = msg.payload[i].Coordinator
              for (var j = 0; j < msg.payload[i].ZoneGroupMember.length; j++) {
                memberNames.push(msg.payload[i].ZoneGroupMember[j].ZoneName)
                if (coordinatorUuid === msg.payload[i].ZoneGroupMember[j].UUID) {
                  coordinatorName = msg.payload[i].ZoneGroupMember[j].ZoneName
                }
              }
            }
          }
          msg.coorinatorUuid = coordinatorUuid
          msg.coordinatorName = coordinatorName
          msg.memberNames = memberNames
        }

        if (response.CurrentZoneGroupName === '') {
          msg.role = 'client'
        } else if (response.CurrentZoneGroupName.includes('+')) {
          msg.role = 'coordinator'
        } else {
          msg.role = 'independent'
        }
        success(node, msg, sonosFunction)
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /** Get EQ information (for specified EQTypes eg NightMode, DialogLevel (akak Speech Enhancement) and SubGain (aka sub Level)) for player with TV-
   * @param  {object} node current node
   * @param  {object} msg incoming message
   *                 msg.topic specifies EQtype
   * @param  {object} sonosPlayer sonos player object
   * @output {object} payload with nightMode, SpeechEnhancement, subGain
   */
  function getEQ (node, msg, sonosPlayer) {
    const sonosFunction = 'get EQ'

    // validate msg.topic
    if (!isTruthyAndNotEmptyString(msg.topic)) {
      failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction)
      return
    }
    if (!ACTIONS_TEMPLATES.SetEQ.eqTypeValues.includes(msg.topic)) {
      failure(node, msg, new Error('n-r-c-s-p: invalid topic. Should be one of ' + ACTIONS_TEMPLATES.SetEQ.eqTypeValues.toString()), sonosFunction)
      return
    }
    const eqType = msg.topic

    sonosPlayer.deviceDescription()
      .then(response => {
        // ensure that SONOS player has TV mode
        if (!isValidPropertyNotEmptyString(response, ['modelName'])) {
          throw new Error('n-r-c-s-p: undefined model name received')
        }
        if (!PLAYER_WITH_TV.includes(response.modelName)) {
          throw new Error('n-r-c-s-p: your player does not support TV')
        }
        return true
      })
      .then(() => {
        // send request to SONOS player
        return getCmd(sonosPlayer.baseUrl, 'GetEQ-' + eqType)
      })
      .then(result => {
        if (eqType === 'SubGain') {
          msg.payload = result
        } else {
          msg.payload = result === '1' ? 'On' : 'Off'
        }
        success(node, msg, sonosFunction)
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /**  Get current crossfade mode.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer Sonos Player
   * @output {String} msg.payload On Off
   */
  function getCrossfadeMode (node, msg, sonosPlayer) {
    const sonosFunction = 'get crossfade mode'
    getCmd(sonosPlayer.baseUrl, 'GetCrossfadeMode')
      .then(result => {
        msg.payload = result === '1' ? 'On' : 'Off'
        success(node, msg, sonosFunction)
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /**  Get current loudness mode.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer Sonos Player
   * @output {String} msg.payload On Off
   */
  function getLoudnessMode (node, msg, sonosPlayer) {
    const sonosFunction = 'get loudness mode'
    getCmd(sonosPlayer.baseUrl, 'GetLoudness')
      .then(result => {
        msg.payload = result === '1' ? 'On' : 'Off'
        success(node, msg, sonosFunction)
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /**  Get remaining sleep timer duration.
   * @param  {object} node current node
   * @param  {object} msg incoming message
   * @param  {object} sonosPlayer Sonos Player
   * @output {String} msg.payload On Off
   */
  function getRemainingSleepTimerDuration (node, msg, sonosPlayer) {
    const sonosFunction = 'get remainig sleep timer'
    getCmd(sonosPlayer.baseUrl, 'GetRemainingSleepTimerDuration')
      .then(result => {
        msg.payload = result === '' ? 'no time set' : result
        success(node, msg, sonosFunction)
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  /**  Test area
   */
  function labFunction (node, msg, sonosPlayer) {
    const sonosFunction = 'lab'
    getGroupMembersData(sonosPlayer)
      .then((members) => {
        msg.payload = members
        success(node, msg, sonosFunction)
      })
      .catch(error => failure(node, msg, error, sonosFunction))
  }

  RED.nodes.registerType('sonos-get-status', SonosGetStatusNode)
}
