var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosManageQueueNode (config) {
    /**  Create Manage Queue Node and subscribe to messages
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

      // Get data from Node dialog
      node.songuri = config.songuri;
      node.position = config.position;
      if (node.position === 'empty') {
        node.position = '';
      }
      node.positioninqueue = config.positioninqueue;

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

  // -------------------------------------------------------------------------

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
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null' });
      node.error('SONOS-PLUS::Error::' + 'Sonos player is null. Check configuration.');
      return;
    }

    // Check msg.payload. Store lowercase version in command
    if (!(msg.payload !== null && msg.payload !== undefined && msg.payload)) {
      node.status({ fill: 'red', shape: 'dot', text: 'invalid payload' });
      node.error('SONOS-PLUS::Error::' + 'Invalid payload.' + JSON.stringify(msg.payload));
      return;
    }
    var command = msg.payload;
    command = '' + command;// convert to string
    command = command.toLowerCase();
    msg.command = command;

    // dispatch
    if (command === 'activate_queue') {
      activateQueue(node, sonosPlayer);
    } else if (command === 'play_next') {
      playNext(node, sonosPlayer);
    } else if (command === 'play_previous') {
      playPrevious(node, sonosPlayer);
    } else if (command === 'play_track') {
      selectTrack(node, sonosPlayer);
    } else if (command === 'flush_queue') {
      sonosPlayer.flush().then(result => {
        node.status({ fill: 'green', shape: 'dot', text: 'OK- flush' });
        node.log('SONOS_PLUS::Info::' + 'flush successful');
      }).catch(err => {
        node.status({ fill: 'red', shape: 'dot', text: 'Error- flush' });
        node.error('SONOS-PLUS::Error::' + 'Details: Could not flush queue - ' + JSON.stringify(err));
      });
    } else if (command === 'get_queue') {
      getQueue(node, msg, sonosPlayer);
    } else {
      node.status({ fill: 'red', shape: 'dot', text: 'warning invalid command!' });
      node.log('SONOS-PLUS::Warning::' + 'invalid command: ' + command);
    }
    node.log('SONOS_PLUS::Success::' + 'Command handed over (async) to subroutine');
  }

  function activateQueue (node, sonosPlayer) {
    // TODO ensure not empty
    sonosPlayer.selectQueue().then(result => {
      node.status({ fill: 'green', shape: 'dot', text: 'OK- activate queue' });
      node.log('SONOS_PLUS::Info:: ' + 'OK Activate Queue');
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'Error- activateQueue' });
      node.error('SONOS-PLUS::Error:: ' + 'Activate Queue ' + 'Details: ' + JSON.stringify(err));
    });
  }

  function playNext (node, sonosPlayer) {
    // TODO Ensure there is next and queue not empty
    sonosPlayer.next().then(result => {
      node.status({ fill: 'green', shape: 'dot', text: 'OK- play next' });
      node.log('SONOS_PLUS::Info:: ' + 'OK play next');
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'Error- play next' });
      node.error('SONOS-PLUS::Error:: ' + 'play next ' + 'Details: ' + JSON.stringify(err));
    });
  }

  function playPrevious (node, sonosPlayer) {
    // TODO Ensure there is next and queue not empty
    sonosPlayer.previous().then(result => {
      node.status({ fill: 'green', shape: 'dot', text: 'OK- play previous' });
      node.log('SONOS_PLUS::Info:: ' + 'OK play previous');
    }).catch(err => {
      node.status({ fill: 'red', shape: 'dot', text: 'Error- play previous' });
      node.error('SONOS-PLUS::Error:: ' + 'play previous ' + 'Details: ' + JSON.stringify(err));
    });
  }

  function selectTrack (node, sonosPlayer) {
    // TODO Ensure there is next and queue not empty
    // TODO only for testing
    sonosPlayer.selectTrack(4).then(result => {
      node.status({ fill: 'green', shape: 'dot', text: 'OK- play' });
    }).catch(err => {
      node.error('Error play track: ' + JSON.stringify(err));
    });
  }

  function getQueue (node, msg, sonosPlayer) {
    sonosPlayer.getQueue().then(queueObj => {
      if (queueObj === null || queueObj === undefined || queueObj.items === undefined || queueObj.items === null) {
        node.status({ fill: 'red', shape: 'dot', text: 'invalid current queue retrieved' });
        node.error('SONOS-PLUS::Error:: ' + 'could not get queue ');
        return;
      }
      var tracksArray = queueObj.items;
      // message albumArtURL
      tracksArray.forEach(function (trackObj) {
        if (trackObj.albumArtURL !== undefined && trackObj.albumArtURL !== null) {
          var port = 1400;
          trackObj.albumArtURI = trackObj.albumArtURL;
          trackObj.albumArtURL = 'http://' + sonosPlayer.host + ':' + port + trackObj.albumArtURI;
        }
      });
      // send message data
      msg.payload = tracksArray;
      node.send(msg);
      node.status({ fill: 'green', shape: 'dot', text: 'OK- get SONOS queue' });
    }).catch(err => {
      console.log('Error retrieving queue %j', err);
      node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve current queue' });
      node.log('SONOS_PLUS::Success::' + 'Could get SONOS queue');
    });
  }
  RED.nodes.registerType('sonos-manage-queue', SonosManageQueueNode);
};
