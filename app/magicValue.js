const testdata = Buffer.from([0, 1, 0, 2, 5, 3, 0, 4])

export function magicGetFloatFromScale (sourceBuffer, startBit, stopBit) {
    let valueBitCount = stopBit - startBit
    if (valueBitCount < 1 || valueBitCount > 8) {
        throw new Error(`valueBitCount is ${valueBitCount}`)
    }
    let valueArray = [...sourceBuffer.slice(startBit + 1, stopBit + 1)]
    // console.log(valueArray)
    while (valueBitCount++ < 8) {
        // console.log('append 0')
        valueArray.unshift(0)
    }
    // console.log(valueArray)
    let bigResult = Buffer.from(valueArray).readBigInt64BE()
    // console.log(bigResult)
    let scaleValue = sourceBuffer.readInt8(startBit)
    if (scaleValue >= 0) {
        return Number(bigResult) * 10 ** scaleValue
    } else {
        let bigResultString = String(bigResult)
        // console.log(bigResultString)
        const dotPosition = bigResultString.length + scaleValue
        bigResultString = bigResultString.substr(0, dotPosition) + "." + bigResultString.substr(dotPosition)
        // console.log(bigResultString)
        return Number(bigResultString)
    }
}

export function magicGetIntAnyLength (sourceBuffer, startBit, stopBit) {
    let length = stopBit - startBit + 1
    let value = sourceBuffer[startBit]
    if (length > 4) throw new Error('Int length must <= 4')
    let counter = 1
    while (counter < length) {
        value <<= 8
        value += sourceBuffer[startBit + counter]
        counter++
    }
    return value
}

// console.log(magicGetFloatFromScale(testdata, 3, 5))
// console.log(magicGetIntAnyLength(testdata, 2, 3))
