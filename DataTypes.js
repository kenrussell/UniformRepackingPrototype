class DataType {
    // All sizes, lengths and alignments are represented in terms of bytes.
    constructor(name,
                std140Size, std140Alignment, std140Offsets, std140Lengths,
                metalSize, metalAlignment, metalOffsets) {
        if (std140Offsets.length != metalOffsets.length) {
            throw "std140 and Metal offset arrays have different sizes";
        }
        this.name = name;
        this.std140Size = std140Size;
        this.std140Alignment = std140Alignment;
        this.std140Offsets = std140Offsets;
        this.std140Lengths = std140Lengths;
        this.metalSize = metalSize;
        this.metalAlignment = metalAlignment;
        this.metalOffsets = metalOffsets;
        let numDataElements = 0;
        for (let i = 0; i < std140Lengths.length; ++i) {
            numDataElements += std140Lengths[i];
        }
        this.numDataElements = DataType.toElementIndexOrSize(numDataElements);
    }

    // This simplistic class assumes that the only supported data
    // types are 4 bytes (ints, floats at the basic level).
    static toElementIndexOrSize(byteOffset) {
        return byteOffset / 4;
    }

    static roundUp(value, alignment) {
        let remainder = value % alignment;
        if (remainder == 0) {
            return value;
        }
        return value + (alignment - remainder);
    }

    // Returns the new byte offset at which the next datum should be laid out.
    #layout(data, typedArray, baseOffset, alignment, size, offsets, lengths) {
        let alignedOffset = DataType.roundUp(baseOffset, alignment);
        let currentDataIndex = 0;
        for (let i = 0; i < offsets.length; ++i) {
            let curOffset = offsets[i];
            let curLength = lengths[i];
            for (let j = 0; j < curLength; j += 4) {
                typedArray[DataType.toElementIndexOrSize(alignedOffset + curOffset)] = data[currentDataIndex];
                ++currentDataIndex;
                curOffset += 4;
            }
        }
        return alignedOffset + size;
    }

    layoutStd140(data, typedArray, baseOffset) {
        return this.#layout(data, typedArray, baseOffset, this.std140Alignment, this.std140Size, this.std140Offsets, this.std140Lengths);
    }

    layoutMetal(data, typedArray, baseOffset) {
        return this.#layout(data, typedArray, baseOffset, this.metalAlignment, this.metalSize, this.metalOffsets, this.std140Lengths);
    }

    repackToMetalLayoutOnCPU(std140TypedArray, metalTypedArray, currentStd140Offset, currentMetalOffset) {
        let alignedStd140Offset = DataType.roundUp(currentStd140Offset, this.std140Alignment);
        let alignedMetalOffset  = DataType.roundUp(currentMetalOffset, this.metalAlignment);
        for (let i = 0; i < this.std140Offsets.length; ++i) {
            // The length of each datum in Metal must be the same as
            // in std140; they just end up at different offsets due to
            // padding.
            for (let j = 0; j < this.std140Lengths[i]; j += 4) {
                metalTypedArray[DataType.toElementIndexOrSize(alignedMetalOffset + this.metalOffsets[i] + j)] =
                    std140TypedArray[DataType.toElementIndexOrSize(alignedStd140Offset + this.std140Offsets[i] + j)];
            }
        }
    }
}

const dataTypes = [
    //           name      Std140Size  Std140Alignment  Std140Offsets  Std140Lengths       MetalSize  MetalAlignment  MetalOffsets
    new DataType('int',    4,          4,               [0],           [4],                4,         4,              [0]),
    new DataType('uint',   4,          4,               [0],           [4],                4,         4,              [0]),
    new DataType('float',  4,          4,               [0],           [4],                4,         4,              [0]),
    new DataType('vec2',   8,          8,               [0],           [8],                8,         8,              [0]),
    new DataType('vec3',   16,         16,              [0],           [12],               16,        16,             [0]),
    new DataType('vec4',   16,         16,              [0],           [16],               16,        16,             [0]),
    new DataType('ivec2',  8,          8,               [0],           [8],                8,         8,              [0]),
    new DataType('ivec3',  16,         16,              [0],           [12],               16,        16,             [0]),
    new DataType('ivec4',  16,         16,              [0],           [16],               16,        16,             [0]),
    new DataType('uvec2',  8,          8,               [0],           [8],                8,         8,              [0]),
    new DataType('uvec3',  16,         16,              [0],           [12],               16,        16,             [0]),
    new DataType('uvec4',  16,         16,              [0],           [16],               16,        16,             [0]),
    new DataType('mat2',   32,         16,              [0, 16],       [8, 8],             16,        8,              [0, 16]),
    new DataType('mat3',   48,         16,              [0, 16, 32],   [12, 12, 12],       48,        16,             [0, 16, 32]),
    new DataType('mat4',   64,         16,              [0],           [64],               64,        16,             [0]),

    // These matrix definitions assume column-major layout, which is
    // the default for OpenGL and the only supported layout in Metal.
    // If they were row-major, then with this simplistic data type
    // representation, every element and its offset would have to be
    // enumerated.
    new DataType('mat2x3', 32,         16,              [0, 16],         [12, 12],         32,        16,             [0, 16]),
    new DataType('mat2x4', 32,         16,              [0],             [32],             32,        16,             [0]),
    new DataType('mat3x2', 48,         16,              [0, 16, 32],     [8, 8, 8],        24,        8,              [0, 8, 16]),
    new DataType('mat3x4', 48,         16,              [0],             [48],             48,        16,             [0]),
    new DataType('mat4x2', 64,         16,              [0, 16, 32, 48], [8, 8, 8, 8],     32,        8,              [0, 8, 16, 24]),
    new DataType('mat4x3', 64,         16,              [0, 16, 32, 48], [12, 12, 12, 12], 64,        16,             [0, 16, 32, 48]),
];

function compareArrayPrefixes(a1, a2) {
    for (let i = 0; i < Math.min(a1.length, a2.length); ++i) {
        if (a1[i] != a2[i])
            return false;
    }
    return true;
}


function output(str) {
    let d = document.getElementById("output");
    if (d) {
        d.innerHTML += "<br>" + str;
    }
    console.log(str);
}

function runTest() {
    for (let i = 0; i < dataTypes.length; ++i) {
        let type = dataTypes[i];
        let data = new Float32Array(type.numDataElements);
        for (let j = 0; j < type.numDataElements; ++j) {
            data[j] = 1 + j;
        }
        let std140Data = new Float32Array(DataType.toElementIndexOrSize(type.std140Size));
        type.layoutStd140(data, std140Data, 0);
        let metalData = new Float32Array(DataType.toElementIndexOrSize(type.metalSize));
        type.layoutMetal(data, metalData, 0);
        let repackedData = new Float32Array(DataType.toElementIndexOrSize(type.metalSize));
        type.repackToMetalLayoutOnCPU(std140Data, repackedData, 0, 0);
        if (!compareArrayPrefixes(metalData, repackedData)) {
            output("Type " + type.name + ": Metal data was not identical to repacked data");
        }
    }
    output("Done.");
}
