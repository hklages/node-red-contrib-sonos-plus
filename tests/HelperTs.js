const { encodeHtmlEntity, decodeHtmlEntity, isTruthyProperty,
  isTruthy, isTruthyStringNotEmpty, isTruthyArray }
  = require('../src/HelperTs.js')

const { describe, it } = require('mocha')
const { expect } = require('chai')

describe('encodeHtmlEntityTs function', () => {

  it('null throws error', async () => {
    const value = null
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('undefined throws error', async () => {
    let value
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('NaN throws error', async () => {
    const value = NaN
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('Infinity throws error', async () => {
    const value = Infinity
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('object throws error', async () => {
    const value = {}
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData is not string')
      })
  })

  it('number throws error', async () => {
    const value = 151
    await encodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData is not string')
      })
  })

  it('empty string allowed', async ()  => {
    const value = ''
    const result = await encodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal(value)
  })

  it('no encoding', async ()  => {
    const value = 'Hello Dolly abcdefghijklmnopqrstuvwxyz'
    const result = await encodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      . equal(value)
  })

  it('simple encoding <>', async () => {
    const value = '<Hello Dolly>'
    const result = await encodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('&lt;Hello Dolly&gt;')
  })

  it('multiple occurrences <>', async () => {
    const value = '<He<l<lo> Dol>ly>'
    const result = await encodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('&lt;He&lt;l&lt;lo&gt; Dol&gt;ly&gt;')
  })

  it('all special character encoding', async () => {
    const value = '<>\'&"'
    const result = await encodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('&lt;&gt;&apos;&amp;&quot;')
  })

})

describe('decodeHtmlEntityTs function', () => {

  it('null throws error', async () => {
    const value = null
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('undefined throws error', async () => {
    let value
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('NaN throws error', async () => {
    const value = NaN
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('Infinity throws error', async () => {
    const value = Infinity
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData invalid/missing')
      })
  })

  it('object throws error', async () => {
    const value = {}
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData is not string')
      })
  })

  it('number throws error', async () => {
    const value = 151
    await decodeHtmlEntity(value)
      .catch(function (err) {
        expect(function () {
          throw err 
        }).to.throw(Error, 'htmlData is not string')
      })
  })

  it('empty string allowed', async ()  => {
    const value = ''
    const result = await decodeHtmlEntity(value)
    expect(result).
      be.a('string').
      equal(value)
  })

  it('no encoding', async ()  => {
    const value = 'Hello Dolly abcdefghijklmnopqrstuvwxyz'
    const result = await decodeHtmlEntity(value)
    expect(result).
      be.a('string').
      equal(value)
  })

  it('simple encoding <>', async () => {
    const value = '&lt;Hello Dolly&gt;'
    const result = await decodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('<Hello Dolly>')
  })

  it('multiple occurrences <>', async () => {
    const value = '&lt;He&lt;l&lt;lo&gt; Dol&gt;ly&gt;'
    const result = await decodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('<He<l<lo> Dol>ly>')
  })

  it('all special character encoding', async () => {
    const value = '&lt;&gt;&apos;&amp;&quot;'
    const result = await decodeHtmlEntity(value)
    expect(result)
      .be.a('string')
      .equal('<>\'&"')
  })

})

describe('isTruthyPropertyTs function', () => {
  
  it('undefined returns false', () => {
    let value
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('undefined explicit returns false', () => {
    const value = undefined
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  
  it('null returns false', () => {
    const value = null
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('NaN returns false', ()  => {
    const value = NaN
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Infinite returns false', ()  => {
    const value = Infinity
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('number returns true', ()  => {
    const value = 100
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('string returns true', ()  => {
    const value = '123456789 abcdefghijklmnopqrstuvwxyz !"§$%&/()=?'
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty string returns true', ()  => {
    const value = ''
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('boolean returns true', ()  => {
    const value = false
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('array returns true', ()  => {
    const value = ['a', 'b']
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty array returns true', ()  => {
    const value = []
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('object returns true', ()  => {
    const value = { 'a': 1, 'b': 'ok' } 
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty object returns true', ()  => {
    const value = {}
    const path = ['value']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('wrong property name returns false', ()  => {
    const value = { 'a': '1' }
    const path = ['x']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('wrong property path returns false', ()  => {
    const value = { 'a': '1' }
    const path = ['value', 'x']
    const obj = { value } 
    const result = isTruthyProperty(obj, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty object returns false', ()  => {
    const path = ['value', 'x']
    const result = isTruthyProperty({}, path)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  
  it('empty path throws error', () => {
    const value = { 'a': '1' }
    const obj = { value } 
    expect(isTruthyProperty.bind(obj, [])).to.throw()
  })

})

describe('isTruthyTs function', () => {
  
  it('undefined returns false', () => {
    let value
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('undefined explicit returns false', () => {
    const value = undefined
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('no argument returns false', () => {
    const result = isTruthy()
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  
  it('null returns false', () => {
    const value = null
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('NaN returns false', ()  => {
    const value = NaN
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Infinite returns false', ()  => {
    const value = Infinity
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('number returns true', ()  => {
    const value = 100
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('string returns true', ()  => {
    const value = '123456789 abcdefghijklmnopqrstuvwxyz !"§$%&/()=?'
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty string returns true', ()  => {
    const value = ''
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('boolean returns true', ()  => {
    const value = false
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('array returns true', ()  => {
    const value = ['a', 'b']
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty array returns true', ()  => {
    const value = []
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('object returns true', ()  => {
    const value = { 'a': 1, 'b': 'ok' } 
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty object returns true', ()  => {
    const value = {}
    const result = isTruthy(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

})

describe('isTruthyStringNotEmptyTs function', () => {
  
  it('undefined returns false', () => {
    let value
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('undefined explicit returns false', () => {
    const value = undefined
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('no argument returns false', () => {
    const result =   isTruthyStringNotEmpty()
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  
  it('null returns false', () => {
    const value = null
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('NaN returns false', ()  => {
    const value = NaN
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Infinite returns false', ()  => {
    const value = Infinity
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('number returns false ', ()  => {
    const value = 100
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('boolean returns false', ()  => {
    const value = false
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('array returns false', ()  => {
    const value = ['a', 'b']
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty array returns false', ()  => {
    const value = []
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('object returns false', ()  => {
    const value = { 'a': 1, 'b': 'ok' } 
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty object returns false', ()  => {
    const value = {}
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty string returns false', ()  => {
    const value = ''
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('string returns true', ()  => {
    const value = '123456789 abcdefghijklmnopqrstuvwxyz !"§$%&/()=?'
    const result =   isTruthyStringNotEmpty(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

})

describe('isTruthyArrayTs function', () => {
  
  it('undefined returns false', () => {
    let value
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('undefined explicit returns false', () => {
    const value = undefined
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('no argument returns false', () => {
    const result = isTruthyArray()
    expect(result)
      .be.a('boolean')
      .equal(false)
  })
  
  it('null returns false', () => {
    const value = null
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('NaN returns false', ()  => {
    const value = NaN
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('Infinite returns false', ()  => {
    const value = Infinity
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty string returns false', ()  => {
    const value = ''
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('string returns false', ()  => {
    const value = '123456789 abcdefghijklmnopqrstuvwxyz !"§$%&/()=?'
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('number returns false ', ()  => {
    const value = 100
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('boolean returns false', ()  => {
    const value = false
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('object returns false', ()  => {
    const value = { 'a': 1, 'b': 'ok' } 
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('empty object returns false', ()  => {
    const value = {}
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(false)
  })

  it('array returns true', ()  => {
    const value = ['a', 'b']
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

  it('empty array returns true', ()  => {
    const value = []
    const result = isTruthyArray(value)
    expect(result)
      .be.a('boolean')
      .equal(true)
  })

})