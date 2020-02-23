const NrcspHelper = require('./Helper.js');
const NrcspSonos = require('./Sonos-Commands.js');

module.exports = function (RED) {
  'use strict';

  /**  Create Control Player Node and subscribe to messages.
  * @param  {object} config current node configuration data
  */
  function SonosControlPlayerNode (config) {
    RED.nodes.createNode(this, config);
    const sonosFunction = 'setup subscribe';

    const node = this;
    const configNode = RED.nodes.getNode(config.confignode);

    if (!((NrcspHelper.isValidProperty(configNode, ['ipaddress']) && NrcspHelper.REGEX_IP.test(configNode.ipaddress)) ||
      (NrcspHelper.isValidProperty(configNode, ['serialnum']) && NrcspHelper.REGEX_SERIAL.test(configNode.serialnum)))) {
      NrcspHelper.failure(node, null, new Error('n-r-c-s-p: invalid config node - missing ip or serial number'), sonosFunction);
      return;
    }

    // clear node status
    node.status({});
    // subscribe and handle input message
    node.on('input', function (msg) {
      node.debug('node - msg received');

      // if ip address exist use it or get it via discovery based on serialNum
      if (!(typeof configNode.ipaddress === 'undefined' || configNode.ipaddress === null ||
        (typeof configNode.ipaddress === 'number' && isNaN(configNode.ipaddress)) || configNode.ipaddress.trim().length < 7)) {
        // exisiting ip address - fastes solution, no discovery necessary
        node.debug('using IP address of config node');
        processInputMsg(node, msg, configNode.ipaddress);
      } else {
        // have to get ip address via disovery with serial numbers
        NrcspHelper.warning(node, sonosFunction, 'No ip address', 'Providing ip address is recommended');
        if (!(typeof configNode.serialnum === 'undefined' || configNode.serialnum === null ||
                (typeof configNode.serialnum === 'number' && isNaN(configNode.serialnum)) || (configNode.serialnum.trim()).length < 19)) {
          NrcspHelper.discoverSonosPlayerBySerial(node, configNode.serialnum, (err, ipAddress) => {
            if (err) {
              NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: discovery failed'), sonosFunction);
              return;
            }
            if (ipAddress === null) {
              NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: could not find any player by serial'), sonosFunction);
            } else {
              // setting of nodestatus is done in following call handelIpuntMessage
              node.debug('Found sonos player');
              processInputMsg(node, msg, ipAddress);
            }
          });
        } else {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: invalid config node - invalid serial'), sonosFunction);
        }
      }
    });
  }

  // ------------------------------------------------------------------------------------

  /**  Validate sonos player and input message then dispatch further.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} ipaddress IP address of sonos player
  */
  function processInputMsg (node, msg, ipaddress) {
    const sonosFunction = 'handle input msg';
    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (typeof sonosPlayer === 'undefined' || sonosPlayer === null ||
      (typeof sonosPlayer === 'number' && isNaN(sonosPlayer)) || sonosPlayer === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined sonos player. Check configuration'), sonosFunction);
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!NrcspHelper.isValidPropertyNotEmptyString(msg, ['payload'])) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined payload', sonosFunction));
      return;
    }

    let command = String(msg.payload);
    command = command.toLowerCase();
    let commandWithParam = {};

    // dispatch
    const basicCommandList = ['play', 'pause', 'stop', 'toggleplayback', 'mute', 'unmute', 'next_song', 'previous_song', 'join_group', 'leave_group', 'activate_avtransport'];
    if (basicCommandList.indexOf(command) > -1) {
      handleCommandBasic(node, msg, sonosPlayer, command);
    } else if (command === 'play_notification') {
      handlePlayNotification(node, msg, sonosPlayer);
    } else if (command.startsWith('+')) {
      commandWithParam = { cmd: 'volume_increase', parameter: command };
      handleVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (command.startsWith('-')) {
      commandWithParam = { cmd: 'volume_decrease', parameter: command };
      handleVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (!isNaN(parseInt(command))) {
      commandWithParam = { cmd: 'volume_set', parameter: command };
      handleVolumeCommand(node, msg, sonosPlayer, commandWithParam);
    } else if (command === 'set_led') {
      handleSetLed(node, msg, sonosPlayer);
    } else if (command === 'set_crossfade') {
      setCrossfadeMode(node, msg, sonosPlayer);
    } else if (command === 'set_loudness') {
      setLoudness(node, msg, sonosPlayer);
    } else if (command === 'set_eq') {
      setEQ(node, msg, sonosPlayer);
    } else if (command === 'set_sleeptimer') {
      configureSleepTimer(node, msg, sonosPlayer);
      // TODO lab_ function - remove
    } else if (command === 'lab_test') {
      labTest(node, msg, sonosPlayer);
    } else {
      NrcspHelper.warning(node, sonosFunction, 'dispatching commands - invalid command', 'command-> ' + JSON.stringify(commandWithParam));
    }
  }

  // -----------------------------------------------------
  // Commands
  // -----------------------------------------------------

  /**  Handle basic commands to control sonos player.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  *                 volume valid volume
  * @param  {object} sonosPlayer Sonos Player
  * @param  {string} cmd command - no parameter
  * @param msg.payload = true if successful
  */
  function handleCommandBasic (node, msg, sonosPlayer, cmd) {
    const sonosFunction = cmd;

    switch (cmd) {
      case 'play':
        sonosPlayer.play()
          .then(() => {
            // validate volume: integer, betweent 1 and 99 and set
            if (typeof msg.volume === 'undefined' || msg.volume === null ||
            (typeof msg.volume === 'number' && isNaN(msg.volume)) || msg.volume === '') {
              // do NOT change volume - just return
              return true;
            }
            const newVolume = parseInt(msg.volume);
            if (Number.isInteger(newVolume)) {
              if (newVolume > 0 && newVolume < 100) {
                // change volume
                node.debug('msg.volume is in range 1...99: ' + newVolume);
                return sonosPlayer.setVolume(newVolume);
              } else {
                node.debug('msg.volume is not in range: ' + newVolume);
                throw new Error('n-r-c-s-p: msg.volume is out of range 1...99: ' + newVolume);
              }
            } else {
              node.debug('msg.volume is not number');
              throw new Error('n-r-c-s-p: msg.volume is not a number: ' + JSON.stringify(msg.volume));
            }
          })
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'stop':
        sonosPlayer.stop()
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'pause':
        sonosPlayer.pause()
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'toggleplayback':
        sonosPlayer.togglePlayback()
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'mute':
        sonosPlayer.setMuted(true)
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'unmute':
        sonosPlayer.setMuted(false)
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'next_song':
        //  CAUTION! PRERQ: there should be a next song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.next()
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'previous_song':
        //  CAUTION! PRERQ: there should be a previous song. Only a few stations support that (example Amazon Prime)
        sonosPlayer.previous(false)
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'leave_group':
        sonosPlayer.leaveGroup()
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;

      case 'join_group': {
        if (typeof msg.topic === 'undefined' || msg.topic === null ||
          (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
          return;
        }

        const deviceToJoing = msg.topic;
        sonosPlayer.joinGroup(deviceToJoing)
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
      }
      case 'activate_avtransport':
        // validate msg.topic
        if (typeof msg.topic === 'undefined' || msg.topic === null ||
          (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic', sonosFunction));
          return;
        }

        sonosPlayer.setAVTransportURI(msg.topic)
          .then(() => { // optionally change volume
            // validate volume: integer, betweent 1 and 99
            if (typeof msg.volume === 'undefined' || msg.volume === null ||
            (typeof msg.volume === 'number' && isNaN(msg.volume)) || msg.volume === '') {
              // do NOT change volume - just return
              return true;
            }
            const newVolume = parseInt(msg.volume);
            if (Number.isInteger(newVolume)) {
              if (newVolume > 0 && newVolume < 100) {
                // change volume
                node.debug('msg.volume is in range 1...99: ' + newVolume);
                return sonosPlayer.setVolume(newVolume);
              } else {
                node.debug('msg.volume is not in range: ' + newVolume);
                throw new Error('n-r-c-s-p: msg.volume is out of range 1...99: ' + newVolume);
              }
            } else {
              node.debug('msg.volume is not number');
              throw new Error('n-r-c-s-p: msg.volume is not a number: ' + JSON.stringify(msg.volume));
            }
          })
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
    }
  }

  /**  Send set/adjust volume command to sonos player.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  * @param  {object} commandObject command - cmd and parameter both as string or volume as integer
  * special: volume range 1.. 99, adjust volume rage -29 ..  +29
  */
  function handleVolumeCommand (node, msg, sonosPlayer, commandObject) {
    const sonosFunction = commandObject.cmd;
    const volumeValue = parseInt(commandObject.parameter); // convert to integer
    switch (commandObject.cmd) {
      case 'volume_set':
        if (Number.isInteger(volumeValue)) {
          if (volumeValue > 0 && volumeValue < 100) {
            node.debug('is in range:' + volumeValue);
          } else {
            NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is out of range: ' + String(volumeValue)));
            return;
          }
        } else {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is not valid number: ' + volumeValue));
          return;
        }
        sonosPlayer.setVolume(volumeValue)
          .then(NrcspHelper.success(node, msg, sonosFunction))
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
      case 'volume_decrease':
      case 'volume_increase':
        if (Number.isInteger(volumeValue)) {
          if (volumeValue > -30 && volumeValue < 30) {
            node.debug('is in range ' + volumeValue);
          } else {
            NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is out of range: ' + String(volumeValue)));
            return;
          }
        } else {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: volume is not valid number: ' + volumeValue));
          return;
        }
        sonosPlayer.adjustVolume(volumeValue)
          .then(() => {
            msg.payload = true;
            NrcspHelper.success(node, msg, sonosFunction);
            return true;
          })
          .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
        break;
    }
  }

  /**  Play Notification.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  *                 topic valid topic lab_play_uri
  *                 volume valide volume to set
  * @param  {object} sonosPlayer Sonos Player
  * uses msg.topic (uri) and optional msg.volume (default is 40)
  */
  function handlePlayNotification (node, msg, sonosPlayer) {
    const sonosFunction = 'play notification';
    // validate msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    // validate msg.volume - use default as backup
    let notificationVolume;
    const defaultVolume = 40;
    if (typeof msg.volume === 'undefined' || msg.volume === null ||
      (typeof msg.volume === 'number' && isNaN(msg.volume)) || msg.volume === '') {
      notificationVolume = defaultVolume; // default
    } else {
      notificationVolume = parseInt(msg.volume);
      if (Number.isInteger(notificationVolume)) {
        if (notificationVolume > 0 && notificationVolume < 100) {
          node.debug('is in range ' + notificationVolume);
        } else {
          node.debug('is not in range: ' + notificationVolume);
          notificationVolume = defaultVolume;
          NrcspHelper.warning(node, sonosFunction, 'volume value out of range - set to default', 'value-> ' + JSON.stringify(notificationVolume));
        }
      } else {
        node.debug('is not number');
        notificationVolume = defaultVolume;
        NrcspHelper.warning(node, sonosFunction, 'invalid volume - set to default', 'value-> ' + JSON.stringify(notificationVolume));
      }
    }
    const uri = String(msg.topic).trim();
    node.debug('notification volume ' + String(notificationVolume));
    sonosPlayer.playNotification(
      {
        uri: uri,
        onlyWhenPlaying: false,
        volume: notificationVolume // Change the volume for the notification, and revert back afterwards.
      })
      .then(() => {
        msg.payload = true;
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction))
      .finally(() => node.debug('process id- finally ' + process.pid));
  }

  /**  Set LED On or Off.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  *             topic: On | Off
  * @param  {object} sonosPlayer Sonos Player
  * @output {object} msg not changeed
  */
  function handleSetLed (node, msg, sonosPlayer) {
    const sonosFunction = 'set LED';
    // validate msg.topic.
    if (typeof msg.topic === 'undefined' || msg.topic === null ||
      (typeof msg.topic === 'number' && isNaN(msg.topic)) || msg.topic === '') {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }

    sonosPlayer.setLEDState(msg.topic)
      .then(() => {
        // msg not changed
        NrcspHelper.success(node, msg, sonosFunction);
        return true;
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Set crossfade mode.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} msg.topic On or Off
  * @param  {object} sonosPlayer Sonos Player
  * @output: {object} msg unmodified / stopped in case of error
  */
  function setCrossfadeMode (node, msg, sonosPlayer) {
    const sonosFunction = 'set crossfade mode';

    // validate msg.topic
    if (!NrcspHelper.isValidPropertyNotEmptyString(msg, ['topic'])) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }
    const newValue = (msg.topic === 'On' ? 1 : 0);

    // execute command
    const baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    NrcspSonos.setCmdBasic(baseUrl, 'SetCrossfadeMode', newValue)
      .then(() => {
        // msg not modified
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Set loudness.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} msg.topic On or Off
  * @param  {object} sonosPlayer Sonos Player
  * @output: {object} msg unmodified / stopped in case of error
  */
  function setLoudness (node, msg, sonosPlayer) {
    const sonosFunction = 'set loudness';

    // validate msg.topic
    if (!NrcspHelper.isValidPropertyNotEmptyString(msg, ['topic'])) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    if (!(msg.topic === 'On' || msg.topic === 'Off')) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
      return;
    }
    const newValue = (msg.topic === 'On' ? 1 : 0);

    // execute command
    const baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    NrcspSonos.setCmdBasic(baseUrl, 'SetLoudness', newValue)
      .then(() => {
        // msg not modified
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /** Set EQ (for specified EQTypes eg NightMode, DialogLevel (aka Speech Enhancement) and SubGain (aka sub Level)) for player with TV.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} msg.topic specifies EQtype
  * @param  {string} msg.eqvalue value On,Off or value -15 .. 15
  * @param  {object} sonosPlayer sonos player object
  * @output: {object} msg unmodified / stopped in case of error
  */
  function setEQ (node, msg, sonosPlayer) {
    const sonosFunction = 'set EQ';

    // validate msg.topic
    if (!NrcspHelper.isValidPropertyNotEmptyString(msg, ['topic'])) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    if (!NrcspSonos.ACTIONS_TEMPLATES.SetEQ.eqTypeValues.includes(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: invalid topic. Should be one of ' + NrcspSonos.ACTIONS_TEMPLATES.SetEQ.eqTypeValues.toString()), sonosFunction);
      return;
    }
    const eqType = msg.topic;

    // validate msg.value
    if (!NrcspHelper.isValidPropertyNotEmptyString(msg, ['eqvalue'])) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined new value'), sonosFunction);
      return;
    }
    let newValue;
    if (eqType === 'SubGain') {
      // validate integer in range -15 to 15
      if (Number.isInteger(msg.eqvalue)) {
        if (msg.eqvalue < -15 || msg.eqvalue > 15) {
          NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.eqvalue must be in range -15 to +15'), sonosFunction);
          return;
        }
        newValue = msg.eqvalue;
      } else {
        NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.eqvalue must be of type integer'), sonosFunction);
        return;
      }
    } else if (eqType === 'NightMode' || eqType === 'DialogLevel') {
      // validate: On/Off
      if (!(msg.eqvalue === 'On' || msg.eqvalue === 'Off')) {
        NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: topic must be On or Off'), sonosFunction);
        return;
      }
      newValue = (msg.eqvalue === 'On' ? 1 : 0);
    } else {
      // not yet supported
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: EQType in msg.topic is not yet supported'), sonosFunction);
      return;
    }

    sonosPlayer.deviceDescription()
      .then((response) => { // ensure that SONOS player has TV mode
        if (typeof response === 'undefined' || response === null ||
            (typeof response === 'number' && isNaN(response)) || response === '') {
          throw new Error('n-r-c-s-p: undefined device description received');
        }
        if (typeof response.modelName === 'undefined' || response.modelName === null ||
            (typeof response.modelName === 'number' && isNaN(response.modelName)) || response.modelName === '') {
          throw new Error('n-r-c-s-p: undefined model name received');
        }
        if (!NrcspHelper.PLAYER_WITH_TV.includes(response.modelName)) {
          throw new Error('n-r-c-s-p: your player does not support TV');
        }
        return true;
      })
      .then(() => { // sonos command
        const args = { InstanceID: 0, EQType: eqType, DesiredValue: newValue };
        const baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
        return NrcspSonos.setCmdComplex(baseUrl, 'SetEQ', args);
      })
      .then(() => {
        // msg not modified
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  Configure/Set the sleep timer.
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {string} msg.topic format hh:mm:ss hh < 20
  * @param  {object} sonosPlayer Sonos Player
  * @output: {object} msg unmodified / stopped in case of error
  */
  function configureSleepTimer (node, msg, sonosPlayer) {
    const sonosFunction = 'set/configure sleep timer';

    // validate msg.topic
    if (!NrcspHelper.isValidPropertyNotEmptyString(msg, ['topic'])) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: undefined topic'), sonosFunction);
      return;
    }
    if (!NrcspHelper.REGEX_TIME.test(msg.topic)) {
      NrcspHelper.failure(node, msg, new Error('n-r-c-s-p: msg.topic must have format hh:mm:ss, hh < 20'), sonosFunction);
      return;
    }
    const newValue = msg.topic;

    // execute command
    const baseUrl = `http://${sonosPlayer.host}:${sonosPlayer.port}`;
    NrcspSonos.setCmdBasic(baseUrl, 'ConfigureSleepTimer', newValue)
      .then(() => {
        // msg not modified
        NrcspHelper.success(node, msg, sonosFunction);
      })
      .catch((error) => NrcspHelper.failure(node, msg, error, sonosFunction));
  }

  /**  LAB: Test new features, error messsages, ...
  * @param  {object} node current node
  * @param  {object} msg incoming message
  * @param  {object} sonosPlayer Sonos Player
  */
  function labTest (node, msg, sonosPlayer) {

  }
  RED.nodes.registerType('sonos-control-player', SonosControlPlayerNode);
};
