var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosControlPlayerNode (config) {
    /**  Create Control Player Node and subscribe to messages
    * @param  {object} config current node configuration data
    */

    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and process message
    var node = this;
    var configNode = RED.nodes.getNode(config.confignode);
    var isValid = helper.validateConfigNodeV2(configNode);
    if (isValid) {
      // clear node status
      node.status({});
      // TODO PRIO 1 it mayb be that ip address does not belong to sonos player or has wrong syntax

      // handle input message
      node.on('input', function (msg) {
        node.log('SONOS_PLUS::Info::' + 'input received');
        helper.identifyPlayerProcessInputMsg(node, configNode, msg, function (ipAddress) {
          if (ipAddress === null) {
            // error handling node status, node error is done in identifyPlayerProcessInputMsg
            node.log('SONOS_PLUS::Info::' + 'Could not find any sonos player!');
          } else {
            node.log('SONOS_PLUS::Success::' + 'Found sonos player and continue!');
            handleInputMsg(node, msg, ipAddress);
          }
        });
      });
    }
  }

  // ------------------------------------------------------------------------------------

  function handleInputMsg (node, msg, ipaddress) {
    /**  Validate sonos player and input message then dispatch
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {string} ipaddress IP address of sonos player
    */

    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null.' });
      node.error('SONOS-PLUS::Error::' + 'Sonos player is null. Check configuration.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      node.status({ fill: 'red', shape: 'dot', text: 'invalid payload.' });
      node.error('SONOS-PLUS::Error::' + 'Invalid payload. ' + JSON.stringify(msg.payload));
      return;
    }

    var command = msg.payload;
    command = '' + command;// convert to string
    command = command.toLowerCase();
    var splitCommand;
    msg.command = command;

    // dispatch
    const commandList = ['play', 'pause', 'stop', 'toggleplayback', 'mute', 'unmute', 'join_group', 'leave_group'];
    if (commandList.indexOf(command) > -1) {
      handleCommandBasic(node, msg, sonosPlayer, command);
    } else if (command.startsWith('+') && !isNaN(parseInt(command)) && parseInt(command) > 0 && parseInt(command) <= 30) {
      splitCommand = { cmd: 'volume_increase', parameter: parseInt(command) };
      handleVolumeCommand(node, msg, sonosPlayer, splitCommand);
    } else if (command.startsWith('-') && !isNaN(parseInt(command)) && parseInt(command) < 0 && parseInt(command) >= -30) {
      splitCommand = { cmd: 'volume_decrease', parameter: parseInt(command) };
      handleVolumeCommand(node, msg, sonosPlayer, splitCommand);
    } else if (!isNaN(parseInt(command)) && parseInt(command) >= 0 && parseInt(command) <= 100) {
      splitCommand = { cmd: 'volume_set', parameter: parseInt(command) };
      handleVolumeCommand(node, msg, sonosPlayer, splitCommand);
    } else {
      node.status({ fill: 'green', shape: 'dot', text: 'warning invalid command' });
      node.log('SONOS-PLUS::Warning::' + 'invalid command: ' + command);
    }
    node.log('SONOS_PLUS::Success::' + 'Command handed over (async) to handlexxxxCommand');
  }

  // ------------------------------------------------------------------------------------

  function handleCommandBasic (node, msg, sonosPlayer, cmd) {
    /**  Initiate basic (no parameter) commands to control sonos player
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {object} sonosPlayer Sonos Player
    * @param  {string} cmd command - no parameter
    */
    switch (cmd) {
      case 'play':
        sonosPlayer.play().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK play ' });
          node.log('SONOS-PLUS::Success::' + 'play. ');
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'error - play' });
          node.error('SONOS-PLUS::Error::' + 'play. ' + 'Details: ' + JSON.stringify(err));
        });
        break;

      case 'stop':
        sonosPlayer.stop().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK stop ' });
          node.log('SONOS-PLUS::Success::' + 'stop. ');
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'error - stop' });
          node.error('SONOS-PLUS::Error::' + 'stop. ' + 'Details: ' + JSON.stringify(err));
        });
        break;

      case 'pause':
        sonosPlayer.pause().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK pause ' });
          node.log('SONOS-PLUS::Success::' + 'pause. ');
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'error - pause' });
          node.error('SONOS-PLUS::Error::' + 'pause. ' + 'Details: ' + JSON.stringify(err));
        });
        break;

      case 'toggleplayback':
        sonosPlayer.togglePlayback().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK toggleplayback ' });
          node.log('SONOS-PLUS::Success::' + 'toggleplayback. ');
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'error - toggleplayback' });
          node.error('SONOS-PLUS::Error::' + 'toggleplayback. ' + 'Details: ' + JSON.stringify(err));
        });
        break;

      case 'mute':
        sonosPlayer.setMuted(true).then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK mute ' });
          node.log('SONOS-PLUS::Success::' + 'mute. ');
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'error - mute' });
          node.error('SONOS-PLUS::Error::' + 'mute. ' + 'Details: ' + JSON.stringify(err));
        });
        break;
      case 'unmute':
        sonosPlayer.setMuted(false).then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK unmute ' });
          node.log('SONOS-PLUS::Success::' + 'unmute. ');
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'error - unmute' });
          node.error('SONOS-PLUS::Error::' + 'unmute. ' + 'Details: ' + JSON.stringify(err));
        });
        break;

      case 'leave_group':
        sonosPlayer.leaveGroup().then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK leave ' });
          node.log('SONOS-PLUS::Success::' + 'leave. ');
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'error - leave' });
          node.error('SONOS-PLUS::Error::' + 'leave. ' + 'Details: ' + JSON.stringify(err));
        });
        break;
      case 'join_group':
        if (msg.topic === null || msg.topic === undefined) {
          node.status({ fill: 'red', shape: 'dot', text: 'error - join - no topic' });
          node.error('SONOS-PLUS::Error::' + 'join. ' + 'Details: ' + 'No valid topic');
        } else {
          var deviceToJoing = msg.topic;
          sonosPlayer.joinGroup(deviceToJoing).then(result => {
            node.status({ fill: 'green', shape: 'dot', text: 'OK join ' });
            node.log('SONOS-PLUS::Success::' + 'join. ');
          }).catch(err => {
            node.status({ fill: 'red', shape: 'dot', text: 'error - join' });
            node.error('SONOS-PLUS::Error::' + 'join. ' + 'Details: ' + JSON.stringify(err));
          });
        }
        break;
    }
  }

  function handleVolumeCommand (node, msg, sonosPlayer, commandObject) {
    /**  Initiate volume commands with one parameter to control sonos player
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {object} sonosPlayer Sonos Player
    * @param  {object} commandObject command - cmd and parameter !! Valid number
    */

    var volumeValue = parseInt(commandObject.parameter);
    switch (commandObject.cmd) {
      case 'volume_set':
        sonosPlayer.setVolume(volumeValue).then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK volume set ' });
          node.log('SONOS-PLUS::Success::' + 'volume set. ');
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'error - volume-set' });
          node.error('SONOS-PLUS::Error::' + 'volume-set. ' + 'Details: ' + JSON.stringify(err));
        });
        break;

      case 'volume_decrease':
      case 'volume_increase':
        sonosPlayer.adjustVolume(volumeValue).then(result => {
          node.status({ fill: 'green', shape: 'dot', text: 'OK volume adjust ' });
          node.log('SONOS-PLUS::Success::' + 'volume adjust. ');
        }).catch(err => {
          node.status({ fill: 'red', shape: 'dot', text: 'error - volume adjust' });
          node.error('SONOS-PLUS::Error::' + 'volume adjust. ' + 'Details: ' + JSON.stringify(err));
        });
        break;
    }
  }
  RED.nodes.registerType('sonos-control-player', SonosControlPlayerNode);
};
