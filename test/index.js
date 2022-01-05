function hexStringToArrayBuffer(hexString) {
	// remove the leading 0x
	hexString = hexString.replace(/^0x/, '');
	
	// ensure even number of characters
	if (hexString.length % 2 != 0) {
		console.log('WARNING: expecting an even number of characters in the hexString');
	}
	
	// check for some non-hex characters
	var bad = hexString.match(/[G-Z\s]/i);
	if (bad) {
		console.log('WARNING: found non-hex characters', bad);    
	}
	
	// split the string into pairs of octets
	var pairs = hexString.match(/[\dA-F]{2}/gi);
	
	// convert the octets to integers
	var integers = pairs.map(function(s) {
		return parseInt(s, 16);
	});
	
	var array = new Uint8Array(integers);				
	return array.buffer;
}

function hex_to_ascii(str1) {
    var hex = str1. toString();
    var str = '';
    for (var n = 0; n < hex. length; n += 2) {
        str += String.fromCharCode(parseInt(hex. substr(n, 2), 16));
    }
    return str;
}

 async function getWalletStats() {
    const isEnabled = await cardano.enable()
    if (!isEnabled) {
        return;
    }
    const networkId = await cardano.getNetworkId();
        document.getElementById("network").innerHTML = 
            networkId == 1 ? "Mainnet" : "Testnet";
    const address = await getAddress();
    document.getElementById("address").innerHTML = address;
    const balance = await getBalance();
    document.getElementById("balance").innerHTML = balance;
    document.getElementById("payment-button").disabled = false;
 }

async function initiatePayment() {
    const address = await cardano.getChangeAddress()
    const utxosHex = await cardano.getUtxos();
    const lovelace = parseInt(document.getElementById("lovelace-input").value);

    const datatosend = { address, lovelace, utxosHex }
    const payload = JSON.stringify(datatosend)
    response = await fetch("/payVendingMachine", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        },
        body: payload
    });
    const tx = await response.text()
    const witnessSet = await cardano.signTx(tx);
    
    const signResponse = await fetch("/getsignedtx?txBytes=" + tx + "&witness=" + witnessSet)
    const signedTx = await signResponse.text()
    await cardano.submitTx(signedTx);
}

async function getBalance() {
    const balanceHex = await cardano.getBalance();
    const balanceBuffer = hexStringToArrayBuffer(balanceHex);
    return CBOR.decode(balanceBuffer)
}

async function getAddress() {
    const address = await cardano.getChangeAddress()
    const datatosend = { address: address }
    const payload = JSON.stringify(datatosend)
    response = await fetch("/getBech32Address", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        },
        body: payload
    });
    return await response.text()
}

async function getUtxos() {
    const utxosHex = await cardano.getUtxos();
    const utxos = utxosHex.map(u => CBOR.decode(hexStringToArrayBuffer(u)));
    const datatosend = { utxosHex, utxos };
    const payload = JSON.stringify(datatosend);
    response = await fetch("/getUtxos", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json;charset=utf-8'
        },
        body: payload
    });
    return await response.text();
}
