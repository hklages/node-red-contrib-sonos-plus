var SonosHelper = require('./SonosHelper.js');
var helper = new SonosHelper();

module.exports = function (RED) {
  'use strict';

  function SonosGetQueueNode (config) {
    RED.nodes.createNode(this, config);

    // verify config node. if valid then set status and process message
    var node = this;
    var configNode = RED.nodes.getNode(config.confignode);
    var isValid = helper.validateConfigNodeV2(configNode);
    if (isValid) {
      // clear node status
      node.status({});

      // handle input message
      node.on('input', function (msg) {
        helper.identifyPlayerProcessInputMsg(node, configNode, msg, function (ipAddress) {
          if (ipAddress === null) {
            // error handling node status, node error is done in identifyPlayerProcessInputMsg
          } else {
            getSonosCurrentQueue(node, msg, ipAddress);
          }
        });
      });
    }
  }

  // ------------------------------------------------------------------------------------------

  function getSonosCurrentQueue (node, msg, ipaddress) {
    const { Sonos } = require('sonos');
    const sonosPlayer = new Sonos(ipaddress);
    if (sonosPlayer === null || sonosPlayer === undefined) {
      node.status({ fill: 'red', shape: 'dot', text: 'sonos player is null' });
    } else {
      sonosPlayer.getQueue().then(queueObj => {
        if (queueObj === null || queueObj === undefined || queueObj.items === undefined || queueObj.items === null) {
          node.status({ fill: 'red', shape: 'dot', text: 'invalid current queue retrieved' });
        } else {
          var tracksArray = queueObj.items;
          // message albumArtURL
          tracksArray.forEach(function (trackObj) {
            if (trackObj.albumArtURL !== undefined && trackObj.albumArtURL !== null) {
              var port = 1400;
              trackObj.albumArtURI = trackObj.albumArtURL;
              trackObj.albumArtURL = 'http://' + ipaddress + ':' + port + trackObj.albumArtURI;
            }
          });

          // send message data
          msg.payload = tracksArray;
          node.send(msg);
          node.status({ fill: 'green', shape: 'dot', text: 'OK' });
        }
      }).catch(err => {
        console.log('Error retrieving queue %j', err);
        node.status({ fill: 'red', shape: 'dot', text: 'failed to retrieve current queue' });
      });
    }
  }

  RED.nodes.registerType('sonos-get-queue', SonosGetQueueNode);
};
