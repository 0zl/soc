'use strict'

const ws = require('ws')
const { EventEmitter } = require('events')

const bufferJson = {
    encode: (data) => {
        return Buffer.from(JSON.stringify(data))
    },

    decode: (data) => {
        return JSON.parse(data.toString())
    }
}

module.exports = class SOC extends EventEmitter {
    constructor(url, clientName, subscribeTypes = []) {
        super()

        this._url = url
        this._isReconnecting = false
        this._socket = null

        this.clientName = clientName
        this.subscribeTypes = subscribeTypes
    }

    send(type, data) {
        if ( this._socket?.readyState === ws.OPEN ) {
            this._socket.send(bufferJson.encode([type, data]))
        }
    }

    log(...args) {
        this.send(0, [`${this.clientName}:`, ...args])
    }
    
    error(...args) {
        this.send(1, [`${this.clientName}: <ERROR>`, ...args])
    }

    async connect() {
        if ( !this._url ) throw new Error('no url provided.')
        if ( !this.clientName ) throw new Error('no clientName provided.')
        if ( !this.subscribeTypes.length ) throw new Error('no subscribeTypes provided.')

        try {
            this._socket = new ws(this._url, { perMessageDeflate: false })

            this._socket.on('open', () => this.send(2, this.clientName))
            this._socket.on('close', async () => {
                this._isReconnecting = true
                await this.reconnect()
            })

            this._socket.on('error', err => console.error(err))
            this._socket.on('message', raw => {
                let [ type ] = bufferJson.decode(raw)
                
                if ( this.subscribeTypes.includes(type) ) {
                    this.emit('message', bufferJson.decode(raw))
                }
            })

            const readyState = () => this._socket?.readyState === ws.OPEN

            return new Promise(async resolve => {
                while ( this._socket?.readyState === ws.CONNECTING ) {
                    await new Promise(resolve => setTimeout(resolve, 100))
                    if ( readyState() ) resolve(true)
                }
            })
        } catch (err) {
            if ( this._isReconnecting ) return await this.reconnect()
            throw err
        }
    }

    async reconnect() {
        let connected = false
        let count = 0

        return new Promise(async resolve => {
            this._isReconnecting = false

            while ( !connected ) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 1000))
                    connected = await this.connect()

                    if ( connected ) {
                        console.clear()
                        console.log('reconnected.')

                        resolve(true)
                    }
                } catch {
                    if ( count++ > 10 ) {
                        console.log('reconnection failed, exit.')
                        process.exit(1)
                    }

                    console.log('reconnection failed, retrying...')
                }
            }
        })
    }
}