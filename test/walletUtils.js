import { a2hex, hex2a, hexStringToArrayBuffer, uint8ArrayToHexString} from "./hexUtils"
const B = require("bech32");

export async function getBalance() {
    const balanceHex = await cardano.getBalance();
    const balanceBuffer = hexStringToArrayBuffer(balanceHex);
    const balance = CBOR.decode(balanceBuffer);
    return parseValue(balance);
}

export function getAddressPrefix(networkId) {
    return networkId == 1 ? "addr" : "addr_test";
}

export async function getAddress(networkId) {
    const addressHex = await cardano.getChangeAddress()
    const addressArray = new Uint8Array(hexStringToArrayBuffer(addressHex));
    const addressWords = B.bech32.toWords(addressArray);
    const address = B.bech32.encode(getAddressPrefix(networkId), addressWords, 1000)
    return address;
    //const datatosend = { address: addressHex }
    //const payload = JSON.stringify(datatosend)
    //const response = await fetch("/getBech32Address", {
    //    method: 'POST',
    //    headers: {
    //        'Content-Type': 'application/json;charset=utf-8'
    //    },
    //    body: payload
    //});
    //return await response.text()
}

export function parseValue(v) {
    var value = null;
    if(typeof(v) === "number") {
        value = {
            lovelace: v,
			otherAssets: []
        };
    } else {
        const lovelace = v[0];
        value = {
            lovelace,
			otherAssets: []
        };
        for (var policyStr in v[1]) {
            var policyInts = new Uint8Array(policyStr.split(",").map(v => parseInt(v)));
            const policy = uint8ArrayToHexString(policyInts);
            for (var assetStr in v[1][policyStr]) {
                var assetInts = new Uint8Array(assetStr.split(",").map(v => parseInt(v)));
                const asset = hex2a(uint8ArrayToHexString(assetInts));
                value.otherAssets.push({
					asset: policy + "." + asset,
					amount: v[1][policyStr][assetStr]
  	          	});
			}
        }
    }
    return value;
}

export async function getUtxos() {
    // TODO: handle pagination
    const utxosHex = await cardano.getUtxos();
    const utxos = utxosHex.map(u => CBOR.decode(hexStringToArrayBuffer(u)));
	const parsedUtxos = []
    for(var i = 0; i < utxos.length; i++){
        parsedUtxos.push(parseUtxo(utxos[i]));
    }

	return parsedUtxos;
}

function parseUtxo(utxo) {
    const input = utxo[0];
    const output = utxo[1];
    const transactionId = uint8ArrayToHexString(input[0]);
    const transactionIndex = input[1];
    const utxoValue = parseValue(output[1]);

	return {
		transactionId,
		transactionIndex,
		value: utxoValue
	}
}