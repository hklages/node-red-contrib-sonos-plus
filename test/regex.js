// Testing regex from Globals

const { describe, it } = require('mocha')
const { expect } = require('chai')
const regex  = require('../src/Globals.js')

describe('REGEX_IP - invalid', function () {
  const tests = [
    '', // empty string
    '.', // just .
    'a',
    '1.1.1.a',
    '1',
    '1.2',
    '1.2.3',
    '1.2.3..4',
    '.',
    '12.12',
    '1234',
    '912.456.123.123',
    '1234.1234.1234',
    '123.123.123.123.123',
    '127.500.3.2',
    '256.111.111.111',
    '111.256.111.111',
    '111.111.256,111',
    '111.111.111.256',
    '-1.1.2.2',
    '1.1.1.1.',
    '1.2.3.4.',
    '.1.2.3.4',
    '....1.2.3.4',
    '1.1.1',
    '1,1,1,1',
    '000.12.234.23.23',
    '999.999.999.999'
  ]
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_IP.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })
})
describe('REGEX_IP - valid', function () {
  const tests = [
    '0.0.0.0',
    '1.1.1.1',
    '1.2.3.4',
    '127.0.0.0',
    '192.168.178.1',
    '192.168.178.2',
    '192.168.178.35',
    '192.168.1.1',
    '255.255.255.255',
    '203.120.223.13'
  ]
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_IP.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })
})

describe('REGEX_DNS - invalid', function () {
  const tests = [
    '', // empty string
    '.', // just .
    '1.2.3.4',
    'mkyong.t.t.c',
    'myyong.t.c',
    'mkyong,com',
    'mkyong',
    'mkyong.123',
    '.com',
    'mkyong.com/users',
    '-mkyong.com',
    'mkyong-.com',
    'sub.-mkyong.com',
    'sub.mkyong-.com',
    '172.168.178.37',
    '172168.178.37',
  ]
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_DNS.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })
})
describe('REGEX_DNS - valid', function () {
  const tests = [
    'www.google.com',
    'google.com',
    'mkyong123.com',
    'mkyong-info.com',
    'sub.mkyong.com',
    'sub.mkyong-info.com',
    'mkyong.com.au',
    'g.co',
    'mkyong.t.t.co',
    'hknas.fritz.box',
    'HKNAS.FRITZ.BOX',
    'maps-to-nonascii.rfc-test.net'
  ]
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_DNS.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })
})

describe('REGEX_HTTP - invalid', function () {
  const tests = [
    '', // empty
    ':',
    ' http://  ',
    ' https://  ',
    'www.google.com',
    'htt://xxxxx',
    'http://',
    'https://',
    'xxxxxx',
    'x.y.z'
  ]
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_HTTP.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })
})
describe('REGEX_HTTP - valid', function () {
  const tests = [
    'http://www.fritz.de/live.m3u',
    'https://www.fritz.de/live.m3u',
    'http://192.168.178.25:80/addons/red/notifications/notification_caution.mp3'
  ]
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_HTTP.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })
})

describe('REGEX_TIME_SPECIAL - invalid', function () {
  const tests = [
    '', // empty
    ':',
    '0:01:00',
    '-0:01:00',
    '-00:00:00',
    '-01:00:00',
    '20:00:00',
    '10',
    '10:20',
    '1:1',
    '00:aa',
    '00:60',
    '00:01:60',
    '00:00:01x',
    '00:00:00:00'
  ]
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_TIME_SPECIAL.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })
})
describe('REGEX_TIME_SPECIAL - valid', function () {
  const tests = [
    '00:00:00',
    '12:00:00',
    '11:10:01',
    '00:02:00',
    '19:00:00',
    '19:59:59'
  ]
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_TIME_SPECIAL.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })
})

describe('REGEX_DELTA - invalid', function () {
  const tests = [
    '', // empty
    ':',
    '0:01:00',
    '-0:01:00',
    '20:00:00',
    '10',
    '10:20',
    '1:1',
    '00:aa',
    '00:60',
    '00:01:60',
    '00:00:01x',
    '00:00:00:00'
  ]
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_TIME_DELTA.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })
})
describe('REGEX_TIME_DELTA - valid', function () {
  const tests = [
    '00:00:00',
    '12:00:00',
    '11:10:01',
    '00:02:00',
    '19:00:00',
    '19:59:59',
    '-00:00:00',
    '-01:00:00',
    '-01:10:00',
    '-19:59:59',
    '-00:00:00',
  ]
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_TIME_DELTA.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })
})

describe('REGEX_RADIO_ID - invalid', function () {
  const tests = [
    '', // empty
    ':',
    's',
    'd1234',
    'a12343',
    'a',
    's1234-',
    ' s1234'
  ]
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_RADIO_ID.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })
})
describe('REGEX_RADIO_ID - valid', function () {
  const tests = [
    's1',
    's12',
    's232',
    's1343134'
  ]
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_RADIO_ID.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })
})

describe('REGEX_QUEUEMODES - invalid', function () {
  const tests = [
    '', // empty
    ':',
    ' NORMAL',
    '-NORMAL',
    '&normal',
    ' normal',
    '-norma',
    'norm-al',
    'normalx',
    'irgendwas',
    'normalx',
    'xnormal'
  ]
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_QUEUEMODES.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })
})
describe('REGEX_QUEUEMODES - valid', function () {
  const tests = [
    'NORMAL',
    'REPEAT_ONE',
    'REPEAT_ALL',
    'SHUFFLE',
    'SHUFFLE_NOREPEAT',
    'normal',
    'nOrMaL',
    'shuffle'
  ]
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_QUEUEMODES.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })
})

describe('REGEX_CSV - invalid', function () {
  const tests = [
    '', // empty
    ':',
    'Küche,',
    ',Küche',
    ' ,Köö',
    'Ba  d',
    'Ba--d',
    'B::1',
    'B,Ba--D',
    '-Bad',
    ' Bad',
    ' ,,,',
    ' ,,',
    ' a, ',
    ' a,,',
    ' ...'
  ]
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_CSV.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })
})
describe('REGEX_CSV - valid', function () {
  const tests = [
    'Küche,Wohnzimmer',
    'W1,K1',
    'Bü,Wo,Sz,Bad',
    'B-1,W 2,M 3',
    '1Küche',
    'Break Room,Conference,Foyer,Office',
    'Living Room Speakers,X1,Y1',
    'X1,Living Room Speakers,X1,Y1',
    'x',
    'x,y',
    '1,2',
    'B:1',
    'B.1',
    'x,B-b-b-b',
    'A E.r_k-er:1',
    'Hall-o',
    'Køkken,Hallo',
    'Badeværelse',
    'Soveværelse',
    'Soveværelse,Badeværelse,Køkken'
  ]
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_CSV.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })
})

describe('REGEX_ANYCHARACTER - invalid', function () {
  const tests = [
    '', // empty
   
  ]
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_ANYCHAR.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })
})
describe('REGEX_ANYCHARACTER - valid', function () {
  const tests = [
    'http://www.fritz.de/live.m3u',
    ' ', // blank
    'Køkken, Hallo',
    '!',
    '!!!!!!',
    'Das Wetter ist schön',
    'player name',
    'Ö',
    '1',
    ' ' // blank
  ]
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_ANYCHAR.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })
})

describe('REGEX_3DIGITSSIGN - invalid', function () {
  const tests = [
    '', // empty
    ':',
    '1234',
    '123  ',
    '',
    '0 1',
    '0.3',
    '.3',
    '33.',
    'aaa',
    '...  ',
    '   xxx'
  ]
  tests.forEach((item) => {
    it(`${item} invalid`, function () {
      expect(regex.REGEX_3DIGITSSIGN.test(item))
        .be.a('boolean')
        .to.be.false
    })
  })
})
describe('REGEX_3DIGITSSIGN - valid', function () {
  const tests = [
    '0',
    '1',
    '10',
    '11',
    '100',
    '110',
    '123',
    '01',
    '-1',
    '-12',
    '-123',
  ]
  tests.forEach((item) => {
    it(`${item} valid`, function () {
      expect(regex.REGEX_3DIGITSSIGN.test(item))
        .be.a('boolean')
        .to.be.true
    })
  })
})