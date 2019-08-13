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
    var isValid = helper.validateConfigNode(node, configNode);
    if (isValid) {
      // clear node status
      node.status({});

      // handle input message
      node.on('input', function (msg) {
        helper.preprocessInputMsg(node, configNode, msg, function (player) {
          if (player === null) {
            helper.setNodeStatus(node, 'error', 'sonos player is null', 'Could not find a valid sonos player. Check configuration Node');
          } else {
            handleInputMsg(node, msg, player.ipaddress);
          }
        });
      });
    }
  }

  // ------------------------------------------------------------------------------------

  function handleInputMsg (node, msg, ipaddress) {
    /**  Validate input message and dispatch
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {string} ipaddress IP address of sonos player
    */
    // get sonos player
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      helper.setNodeStatus(node, 'error', 'sonos player is null', 'Could not find a valid sonos player. Check configuration Node');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      helper.setNodeStatus(node, 'error', 'invalid payload', 'Invalid payload. Read documentation.');
      return;
    }
    var command = msg.payload;
    command = '' + command;// convert to string
    command = command.toLowerCase();
    var splitCommand;

    // dispatch
    const commandList = ['play', 'pause', 'stop', 'toggleplayback', 'mute', 'unmute'];
    if (commandList.indexOf(command) > -1) {
      handleCommandBasic(node, msg, sonosPlayer, command);
    } else if (command.startsWith('+') && !isNaN(parseInt(command)) && parseInt(command) > 0 && parseInt(command) <= 30) {
      splitCommand = { function: 'volume_up', parameter: parseInt(command) };
      handleVolumeCommand(node, msg, sonosPlayer, splitCommand);
    } else if (command.startsWith('-') && !isNaN(parseInt(command)) && parseInt(command) < 0 && parseInt(command) >= -30) {
      splitCommand = { function: 'volume_down', parameter: parseInt(command) };
      handleVolumeCommand(node, msg, sonosPlayer, splitCommand);
    } else if (!isNaN(parseInt(command)) && parseInt(command) >= 0 && parseInt(command) <= 100) {
      splitCommand = { function: 'volume_set', parameter: parseInt(command) };
      handleVolumeCommand(node, msg, sonosPlayer, splitCommand);
    } else {
      helper.setNodeStatus(node, 'warning', 'invalid command.', command);
    }
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
          helper.setNodeStatus(node, 'success', 'play', '');
        }).catch(err => {
          helper.setNodeStatus(node, 'error', 'play', err);
        });
        break;

      case 'stop':
        sonosPlayer.stop().then(result => {
          helper.setNodeStatus(node, 'success', 'stop', '');
        }).catch(err => {
          helper.setNodeStatus(node, 'error', 'stop', err);
        });
        break;

      case 'pause':
        sonosPlayer.pause().then(result => {
          helper.setNodeStatus(node, 'success', 'pause', '');
        }).catch(err => {
          helper.setNodeStatus(node, 'error', 'pause', err);
        });
        break;

      case 'toggleplayback':
        sonosPlayer.togglePlayback().then(result => {
          helper.setNodeStatus(node, 'success', 'toggleplayback', '');
        }).catch(err => {
          helper.setNodeStatus(node, 'error', 'toggleplayback', err);
        });
        break;

      case 'mute':
        sonosPlayer.setMuted(true).then(result => {
          helper.setNodeStatus(node, 'success', 'mute', '');
        }).catch(err => {
          helper.setNodeStatus(node, 'error', 'mute', err);
        });
        break;
      case 'unmute':
        sonosPlayer.setMuted(false).then(result => {
          helper.setNodeStatus(node, 'success', 'unmute', '');
        }).catch(err => {
          helper.setNodeStatus(node, 'error', 'unmute', err);
        });
        break;
    }
  }

  function handleVolumeCommand (node, msg, sonosPlayer, commandObject) {
    /**  Initiate volume commands with one parameter to control sonos player
    * @param  {Object} node current node
    * @param  {object} msg incoming message
    * @param  {object} sonosPlayer Sonos Player
    * @param  {object} cmd command - function and parameter !! Valid number
    */

    var volumeValue = parseInt(commandObject.parameter);
    switch (commandObject.function) {
      case 'volume_set':
        sonosPlayer.setVolume(volumeValue).then(result => {
          helper.setNodeStatus(node, 'success', 'volume, set', '');
        }).catch(err => {
          helper.setNodeStatus(node, 'error', 'set volume', err);
        });
        break;

      case 'volume_down':
      case 'volume_up':
        sonosPlayer.adjustVolume(volumeValue).then(result => {
          helper.setNodeStatus(node, 'success', 'volume adjust', '');
        }).catch(err => {
          helper.setNodeStatus(node, 'error', 'adjust volume', err);
        });
        break;
    }
  }
  RED.nodes.registerType('sonos-control-player', SonosControlPlayerNode);
};
