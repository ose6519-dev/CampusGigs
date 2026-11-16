// ../../node_modules/jose/dist/webapi/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var strictDecoder = new TextDecoder("utf-8", { fatal: !0 });
function concat(...buffers) {
	const size = buffers.reduce((acc, { length }) => acc + length, 0), buf = new Uint8Array(size);
	let i = 0;
	for (const buffer of buffers) buf.set(buffer, i), i += buffer.length;
	return buf;
}
var NON_ASCII = /[^\x00-\x7f]/;
function encode(string) {
	if (typeof string == "string" && string.length >= 128) {
		if (NON_ASCII.test(string)) throw new TypeError("non-ASCII string encountered in encode()");
		return encoder.encode(string);
	}
	const bytes = new Uint8Array(string.length);
	for (let i = 0; i < string.length; i++) {
		const code = string.charCodeAt(i);
		if (code > 127) throw new TypeError("non-ASCII string encountered in encode()");
		bytes[i] = code;
	}
	return bytes;
}
function decodeBase64(encoded, url = !1) {
	if (Uint8Array.fromBase64) return Uint8Array.fromBase64(encoded, { alphabet: url ? "base64url" : "base64" });
	if (url) {
		if (encoded.includes("+") || encoded.includes("/")) throw new TypeError("Invalid base64url");
		encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
	}
	const binary = atob(encoded), bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}
// ../../node_modules/jose/dist/webapi/util/errors.js
var JOSEError = class extends Error {
	static code = "ERR_JOSE_GENERIC";
	code = "ERR_JOSE_GENERIC";
	constructor(message, options) {
		super(message, options), this.name = this.constructor.name, Error.captureStackTrace?.(this, this.constructor);
	}
};
var JWTClaimValidationFailed = class extends JOSEError {
	static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
	code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
	claim;
	reason;
	payload;
	constructor(message, payload, claim = "unspecified", reason = "unspecified") {
		super(message, { cause: {
			claim,
			reason,
			payload
		} }), this.claim = claim, this.reason = reason, this.payload = payload;
	}
};
var JWTExpired = class extends JOSEError {
	static code = "ERR_JWT_EXPIRED";
	code = "ERR_JWT_EXPIRED";
	claim;
	reason;
	payload;
	constructor(message, payload, claim = "unspecified", reason = "unspecified") {
		super(message, { cause: {
			claim,
			reason,
			payload
		} }), this.claim = claim, this.reason = reason, this.payload = payload;
	}
};
var JOSEAlgNotAllowed = class extends JOSEError {
	static code = "ERR_JOSE_ALG_NOT_ALLOWED";
	code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
	static code = "ERR_JOSE_NOT_SUPPORTED";
	code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid = class extends JOSEError {
	static code = "ERR_JWS_INVALID";
	code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
	static code = "ERR_JWT_INVALID";
	code = "ERR_JWT_INVALID";
};
var JWSSignatureVerificationFailed = class extends JOSEError {
	static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
	code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
	constructor(message = "signature verification failed", options) {
		super(message, options);
	}
};
// ../../node_modules/jose/dist/webapi/util/base64url.js
var invalid = "The input to be decoded is not correctly encoded.";
function decode(input) {
	try {
		return decodeBase64(typeof input == "string" ? input : decoder.decode(input), !0);
	} catch (cause) {
		throw new TypeError(invalid, { cause });
	}
}
// ../../node_modules/jose/dist/webapi/lib/validate.js
function isObject(input) {
	if (typeof input != "object" || input === null || Object.prototype.toString.call(input) !== "[object Object]") return !1;
	const prototype = Object.getPrototypeOf(input);
	return prototype === null || Object.getPrototypeOf(prototype) === null;
}
function isDisjoint(...headers) {
	const parameters = /* @__PURE__ */ new Set();
	for (const header of headers) if (header) for (const parameter of Object.keys(header)) {
		if (parameters.has(parameter)) return !1;
		parameters.add(parameter);
	}
	return !0;
}
function decodeBase64url(value, label, ErrorClass) {
	try {
		return decode(value);
	} catch (cause) {
		throw new ErrorClass(`Failed to base64url decode the ${label}`, { cause });
	}
}
function encodeAsciiMember(value, label, ErrorClass) {
	try {
		return encode(value);
	} catch (cause) {
		throw new ErrorClass(`The ${label} is not a valid base64url string`, { cause });
	}
}
function parseJoseHeader(encodedProtectedHeader, ErrorClass, message) {
	let parsed;
	try {
		parsed = JSON.parse(strictDecoder.decode(decode(encodedProtectedHeader)));
	} catch (cause) {
		throw new ErrorClass(message, { cause });
	}
	if (!isObject(parsed)) throw new ErrorClass(message);
	return parsed;
}
var JWS_RECOGNIZED = {
	__proto__: null,
	b64: !0
};
function validateAlgorithms(option, algorithms) {
	if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s != "string"))) throw new TypeError(`"${option}" option must be an array of strings`);
	return algorithms === void 0 ? void 0 : new Set(algorithms);
}
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
	if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) throw new Err("\"crit\" (Critical) Header Parameter MUST be integrity protected");
	if (!protectedHeader || protectedHeader.crit === void 0) return [];
	if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input != "string" || input.length === 0)) throw new Err("\"crit\" (Critical) Header Parameter MUST be an array of non-empty strings when present");
	const recognized = recognizedOption === void 0 ? recognizedDefault : {
		__proto__: null,
		...recognizedOption,
		...recognizedDefault
	};
	for (const parameter of protectedHeader.crit) {
		if (!(parameter in recognized)) throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
		if (!Object.hasOwn(joseHeader, parameter) || joseHeader[parameter] === void 0) throw new Err(`Extension Header Parameter "${parameter}" is missing`);
		if (recognized[parameter] && (!Object.hasOwn(protectedHeader, parameter) || protectedHeader[parameter] === void 0)) throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
	}
	return protectedHeader.crit;
}
function validateB64(protectedHeader, extensions) {
	if (extensions.includes("b64")) {
		const b64 = protectedHeader.b64;
		if (typeof b64 != "boolean") throw new JWSInvalid("The \"b64\" (base64url-encode payload) Header Parameter must be a boolean");
		return b64;
	}
	return !0;
}
// ../../node_modules/jose/dist/webapi/lib/key.js
var tag = (key) => key[Symbol.toStringTag];
var jwkMatchesOp = (entry, key, usage) => {
	const { alg } = entry;
	if (key.use !== void 0) {
		const expected = usage === "sign" || usage === "verify" ? "sig" : "enc";
		if (key.use !== expected) throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
	}
	if (key.alg !== void 0 && key.alg !== alg) throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
	if (Array.isArray(key.key_ops)) {
		const expectedKeyOp = usage === "encrypt" || usage === "decrypt" ? entry.ops?.[usage === "encrypt" ? 0 : 1] : usage;
		if (expectedKeyOp && !key.key_ops.includes(expectedKeyOp)) throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
	}
};
async function prepareKey(entry, key, usage) {
	const { alg, secret } = entry, requiresPrivateKey = usage === "decrypt" || usage === "sign";
	if (secret && key instanceof Uint8Array) return key;
	let normalized, keyObject;
	if (isObject(key)) {
		if (normalized = normalizeJwk(key), typeof normalized.kty != "string") throw invalidKeyType(alg, key, secret);
		if (!(secret ? normalized.kty === "oct" && typeof normalized.k == "string" : normalized.kty !== "oct" && (requiresPrivateKey ? normalized.kty === "AKP" && typeof normalized.priv == "string" || typeof normalized.d == "string" : normalized.d === void 0 && normalized.priv === void 0))) throw new TypeError(secret ? "JSON Web Key for symmetric algorithms must have JWK \"kty\" (Key Type) equal to \"oct\" and the JWK \"k\" (Key Value) present" : `JSON Web Key for this operation must be a ${requiresPrivateKey ? "private" : "public"} JWK`);
		if (jwkMatchesOp(entry, normalized, usage), normalized.kty === "oct") return decode(normalized.k);
		if (!Object.isFrozen(key)) {
			const { key_ops } = key;
			Array.isArray(key_ops) && Object.freeze(key_ops), Object.freeze(key);
		}
	} else {
		if (!isKeyLike(key)) throw invalidKeyType(alg, key, secret);
		const expectedType = secret ? "secret" : requiresPrivateKey ? "private" : "public";
		if (key.type !== expectedType && (secret || [
			"secret",
			"public",
			"private"
		].includes(key.type))) throw new TypeError(`${tag(key)} instances must be of type "${expectedType}" for the ${alg} algorithm`);
		if (isCryptoKey(key)) return key;
		if (keyObject = key, keyObject.type === "secret") return keyObject.export();
	}
	cache ||= /* @__PURE__ */ new WeakMap();
	const cacheKey = key;
	let cached = cache.get(cacheKey);
	if (cached?.[alg]) return cached[alg];
	if (cached || cache.set(cacheKey, cached = {}), keyObject && typeof keyObject.toCryptoKey == "function") {
		const isPublic = keyObject.type === "public", crv = nist[keyObject.asymmetricKeyDetails?.namedCurve], params = entry.resolve?.({
			crv,
			asymmetricKeyType: keyObject.asymmetricKeyType
		}) ?? entry.subtle;
		return cached[alg] = keyObject.toCryptoKey(params, isPublic, entry.usages[isPublic ? 0 : 1]);
	}
	return normalized ??= keyObject.export({ format: "jwk" }), normalized.alg = alg, cached[alg] = await jwkToKey(entry, normalized);
}
var cache;
var nist = {
	__proto__: null,
	prime256v1: "P-256",
	secp384r1: "P-384",
	secp521r1: "P-521"
};
var isCryptoKey = (key) => {
	if (key?.[Symbol.toStringTag] === "CryptoKey") return !0;
	try {
		return key instanceof CryptoKey;
	} catch {
		return !1;
	}
};
var isKeyObject = (key) => key?.[Symbol.toStringTag] === "KeyObject";
var isKeyLike = (key) => isCryptoKey(key) || isKeyObject(key);
function message(msg, actual, ...types) {
	if (types.length > 2) {
		const last = types.pop();
		msg += `one of type ${types.join(", ")}, or ${last}.`;
	} else types.length === 2 ? msg += `one of type ${types[0]} or ${types[1]}.` : msg += `of type ${types[0]}.`;
	return actual == null ? msg += ` Received ${actual}` : typeof actual == "function" && actual.name ? msg += ` Received function ${actual.name}` : typeof actual == "object" && actual != null && actual.constructor?.name && (msg += ` Received an instance of ${actual.constructor.name}`), msg;
}
function invalidKeyType(alg, actual, secret) {
	const types = [
		"CryptoKey",
		"KeyObject",
		"JSON Web Key"
	];
	return secret && types.push("Uint8Array"), new TypeError(message(`Key for the ${alg} algorithm must be `, actual, ...types));
}
var unusable = (name, prop = "algorithm.name") => /* @__PURE__ */ new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
function checkUsage(key, usage) {
	if (usage && !key.usages.includes(usage)) throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
}
function checkModulusLength(alg, key) {
	const { modulusLength } = key.algorithm;
	if (typeof modulusLength != "number" || modulusLength < 2048) throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
}
function checkCryptoKey(key, expected, usage) {
	const algorithm = key.algorithm;
	if (algorithm.name !== expected.name) throw unusable(expected.name);
	if (expected.hash && algorithm.hash?.name !== expected.hash) throw unusable(expected.hash, "algorithm.hash");
	if (expected.namedCurve && algorithm.namedCurve !== expected.namedCurve) throw unusable(expected.namedCurve, "algorithm.namedCurve");
	if (expected.length !== void 0 && algorithm.length !== expected.length) throw unusable(expected.length, "algorithm.length");
	checkUsage(key, usage);
}
function snapshotJwk(jwk) {
	return {
		__proto__: null,
		...jwk
	};
}
function normalizeJwk(jwk) {
	const normalized = snapshotJwk(jwk);
	if (normalized.ext !== void 0 && typeof normalized.ext != "boolean") throw new TypeError("\"ext\" (Extractable) Parameter must be a boolean");
	if (normalized.key_ops !== void 0) {
		const value = normalized.key_ops, keyOps = Array.isArray(value) ? [...value] : void 0;
		if (!keyOps || keyOps.some((operation) => typeof operation != "string") || new Set(keyOps).size !== keyOps.length) throw new TypeError("\"key_ops\" (Key Operations) Parameter must be an array of unique strings");
		normalized.key_ops = keyOps;
	}
	return normalized;
}
function validateExtractableOption(extractable) {
	if (extractable !== void 0 && typeof extractable != "boolean") throw new TypeError("\"extractable\" option must be a boolean");
	return extractable;
}
async function jwkToKey(entry, jwk, extractable) {
	if (!entry.kty.includes(jwk.kty)) throw new JOSENotSupported("Invalid or unsupported JWK \"alg\" (Algorithm) Parameter value");
	const algorithm = entry.resolve?.({
		kty: jwk.kty,
		crv: jwk.crv
	}) ?? entry.subtle, isPrivate = !!(jwk.d || jwk.priv), keyData = {
		...jwk,
		ext: extractable ?? jwk.ext
	};
	return keyData.kty !== "AKP" && delete keyData.alg, delete keyData.use, crypto.subtle.importKey("jwk", keyData, algorithm, keyData.ext ?? !isPrivate, jwk.key_ops ?? entry.usages[isPrivate ? 1 : 0]);
}
async function rawKey(key, expected, usage, extractable = !1) {
	return key instanceof Uint8Array && (key = await crypto.subtle.importKey("raw", key, expected, extractable, [usage])), checkCryptoKey(key, expected, usage), key;
}
// ../../node_modules/jose/dist/webapi/lib/key_descriptor.js
function table(entries) {
	const out = { __proto__: null };
	for (const alg in entries) out[alg] = {
		...entries[alg],
		alg
	};
	return out;
}
// ../../node_modules/jose/dist/webapi/lib/jwe_algorithms.js
var wrap = [["encrypt", "wrapKey"], ["decrypt", "unwrapKey"]];
var derive = [[], ["deriveBits"]];
var none = [[], []];
function rsaes(bits) {
	return {
		kty: ["RSA"],
		mode: "key-encryption",
		subtle: {
			name: "RSA-OAEP",
			hash: `SHA-${bits}`
		},
		usages: wrap,
		ops: ["wrapKey", "unwrapKey"]
	};
}
function ecdh(mode) {
	return {
		kty: ["EC", "OKP"],
		mode,
		subtle: { name: "ECDH" },
		resolve: ({ kty, crv, asymmetricKeyType }) => {
			if (crv === "X25519" || asymmetricKeyType === "x25519") return { name: "X25519" };
			if (kty === "OKP") throw new JOSENotSupported("Invalid or unsupported JWK \"alg\" (Algorithm) Parameter value");
			return {
				name: "ECDH",
				namedCurve: crv
			};
		},
		usages: derive,
		ops: [void 0, "deriveBits"]
	};
}
function aeskw(bits, gcm = !1) {
	return {
		kty: ["oct"],
		mode: "key-wrapping",
		secret: !0,
		subtle: {
			name: gcm ? "AES-GCM" : "AES-KW",
			length: bits
		},
		usages: none,
		ops: gcm ? ["encrypt", "decrypt"] : ["wrapKey", "unwrapKey"]
	};
}
function pbes2() {
	return {
		kty: ["oct"],
		mode: "key-wrapping",
		secret: !0,
		subtle: { name: "PBKDF2" },
		usages: none,
		ops: ["deriveBits", "deriveBits"]
	};
}
var JWE = table({
	dir: {
		kty: ["oct"],
		mode: "direct-encryption",
		secret: !0,
		subtle: { name: "AES-GCM" },
		usages: none,
		ops: ["encrypt", "decrypt"]
	},
	"RSA-OAEP": rsaes(1),
	"RSA-OAEP-256": rsaes(256),
	"RSA-OAEP-384": rsaes(384),
	"RSA-OAEP-512": rsaes(512),
	"ECDH-ES": ecdh("direct-key-agreement"),
	"ECDH-ES+A128KW": ecdh("key-agreement-with-key-wrapping"),
	"ECDH-ES+A192KW": ecdh("key-agreement-with-key-wrapping"),
	"ECDH-ES+A256KW": ecdh("key-agreement-with-key-wrapping"),
	A128KW: aeskw(128),
	A192KW: aeskw(192),
	A256KW: aeskw(256),
	A128GCMKW: aeskw(128, !0),
	A192GCMKW: aeskw(192, !0),
	A256GCMKW: aeskw(256, !0),
	"PBES2-HS256+A128KW": pbes2(),
	"PBES2-HS384+A192KW": pbes2(),
	"PBES2-HS512+A256KW": pbes2()
});
var contentOps = ["encrypt", "decrypt"];
function contentEncryption(bits, cbc = !1) {
	return {
		kty: ["oct"],
		secret: !0,
		subtle: {
			name: cbc ? "AES-CBC" : "AES-GCM",
			length: bits
		},
		usages: none,
		ops: contentOps,
		cekBits: bits,
		ivBits: cbc ? 128 : 96,
		cbc
	};
}
table({
	A128GCM: contentEncryption(128),
	A192GCM: contentEncryption(192),
	A256GCM: contentEncryption(256),
	"A128CBC-HS256": contentEncryption(256, !0),
	"A192CBC-HS384": contentEncryption(384, !0),
	"A256CBC-HS512": contentEncryption(512, !0)
});
// ../../node_modules/jose/dist/webapi/lib/jws_algorithms.js
var sig = [["verify"], ["sign"]];
function hmac(bits) {
	const subtle = {
		name: "HMAC",
		hash: `SHA-${bits}`
	};
	return {
		kty: ["oct"],
		secret: !0,
		subtle,
		signing: subtle,
		usages: sig
	};
}
function rsa(bits, saltLength) {
	const subtle = {
		name: saltLength ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
		hash: `SHA-${bits}`
	};
	return {
		kty: ["RSA"],
		subtle,
		signing: saltLength ? {
			...subtle,
			saltLength
		} : subtle,
		usages: sig,
		minRsaBits: 2048
	};
}
function ecdsa(crv, bits) {
	return {
		kty: ["EC"],
		crv,
		subtle: {
			name: "ECDSA",
			namedCurve: crv
		},
		signing: {
			name: "ECDSA",
			hash: `SHA-${bits}`
		},
		usages: sig
	};
}
function eddsa() {
	const subtle = { name: "Ed25519" };
	return {
		kty: ["OKP"],
		crv: "Ed25519",
		subtle,
		signing: subtle,
		usages: sig
	};
}
function mldsa(parameterSet) {
	const subtle = { name: `ML-DSA-${parameterSet}` };
	return {
		kty: ["AKP"],
		subtle,
		signing: subtle,
		usages: sig
	};
}
var JWS = table({
	HS256: hmac(256),
	HS384: hmac(384),
	HS512: hmac(512),
	RS256: rsa(256),
	RS384: rsa(384),
	RS512: rsa(512),
	PS256: rsa(256, 32),
	PS384: rsa(384, 48),
	PS512: rsa(512, 64),
	ES256: ecdsa("P-256", 256),
	ES384: ecdsa("P-384", 384),
	ES512: ecdsa("P-521", 512),
	EdDSA: eddsa(),
	Ed25519: eddsa(),
	"ML-DSA-44": mldsa(44),
	"ML-DSA-65": mldsa(65),
	"ML-DSA-87": mldsa(87)
});
function jwsAlgorithm(alg) {
	const entry = typeof alg == "string" ? JWS[alg] : void 0;
	if (!entry) throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
	return entry;
}
// ../../node_modules/jose/dist/webapi/lib/jws_verify.js
function prepareVerify(options) {
	return [options && validateAlgorithms("algorithms", options.algorithms), options?.crit];
}
function parseProtectedHeader(encodedProtectedHeader) {
	return encodedProtectedHeader === void 0 ? {} : parseJoseHeader(encodedProtectedHeader, JWSInvalid, "JWS Protected Header is invalid");
}
function encodeCompactUnencodedPayload(payload) {
	try {
		return encode(payload);
	} catch (cause) {
		throw new JWSInvalid("JWS Compact Serialization payload must use only ASCII characters", { cause });
	}
}
async function verifySignature(jws, shared, key, encodeUnencodedPayload, parsedProtected) {
	const { protected: encodedProtectedHeader, header, payload: inputPayload } = jws, protectedHeader = parsedProtected ?? parseProtectedHeader(encodedProtectedHeader);
	if (!isDisjoint(protectedHeader, header)) throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
	const joseHeader = {
		...protectedHeader,
		...header
	}, b64 = validateB64(protectedHeader, validateCrit(JWSInvalid, JWS_RECOGNIZED, shared[1], protectedHeader, joseHeader)), { alg } = joseHeader;
	if (typeof alg != "string" || !alg) throw new JWSInvalid("JWS \"alg\" (Algorithm) Header Parameter missing or invalid");
	if (shared[0] && !shared[0].has(alg)) throw new JOSEAlgNotAllowed("\"alg\" (Algorithm) Header Parameter value not allowed");
	if (b64) {
		if (typeof inputPayload != "string") throw new JWSInvalid("JWS Payload must be a string");
	} else if (typeof inputPayload != "string" && !(inputPayload instanceof Uint8Array)) throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
	const signingPayload = b64 || typeof inputPayload != "string" ? inputPayload : encodeUnencodedPayload(inputPayload);
	let resolvedKey = !1;
	typeof key == "function" && (key = await key(protectedHeader, jws), resolvedKey = !0);
	const entry = jwsAlgorithm(alg), signingInput = concat(encodedProtectedHeader !== void 0 ? encode(encodedProtectedHeader) : /* @__PURE__ */ new Uint8Array(), encode("."), typeof signingPayload == "string" ? shared[2] ??= encodeAsciiMember(signingPayload, "payload", JWSInvalid) : signingPayload), signature = decodeBase64url(jws.signature, "signature", JWSInvalid), verificationKey = await prepareKey(entry, key, "verify"), cryptoKey = await rawKey(verificationKey, entry.subtle, "verify");
	entry.minRsaBits && checkModulusLength(entry.alg, cryptoKey);
	let verified = !1;
	try {
		verified = await crypto.subtle.verify(entry.signing, cryptoKey, signature, signingInput);
	} catch (cause) {
		throw new JWSSignatureVerificationFailed(void 0, { cause });
	}
	if (!verified) throw new JWSSignatureVerificationFailed();
	const result = { payload: typeof signingPayload == "string" ? decodeBase64url(signingPayload, "payload", JWSInvalid) : signingPayload };
	return encodedProtectedHeader !== void 0 && (result.protectedHeader = protectedHeader), header !== void 0 && (result.unprotectedHeader = header), resolvedKey ? [{
		...result,
		key: verificationKey
	}, b64] : [result, b64];
}
async function verifyCompact(jws, shared, key) {
	if (jws instanceof Uint8Array && (jws = decoder.decode(jws)), typeof jws != "string") throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
	const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
	if (length !== 3) throw new JWSInvalid("Invalid Compact JWS");
	return verifySignature({
		payload,
		protected: protectedHeader,
		signature
	}, shared, key, encodeCompactUnencodedPayload);
}
// ../../node_modules/jose/dist/webapi/lib/jwt_claims_set.js
var epoch = (date) => Math.floor(date.getTime() / 1e3);
var multipliers = {
	s: 1,
	m: 60,
	h: 3600,
	d: 86400,
	w: 604800,
	y: 31557600
};
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var checkFailed = "check_failed";
function invalidDuration() {
	throw new TypeError("Invalid time period format");
}
function secs(str) {
	typeof str != "string" && invalidDuration();
	const matched = REGEX.exec(str);
	(!matched || matched[4] && matched[1]) && invalidDuration();
	const value = parseFloat(matched[2]), durationSeconds = Math.round(value * multipliers[matched[3][0].toLowerCase()]);
	return Number.isFinite(durationSeconds) || invalidDuration(), matched[1] === "-" || matched[4] === "ago" ? -durationSeconds : durationSeconds;
}
function validateInput(label, input) {
	if (!Number.isFinite(input)) throw new TypeError(`Invalid ${label} input`);
	return input;
}
var normalizeTyp = (value) => {
	const normalized = value.toLowerCase();
	return value.includes("/") ? normalized : `application/${normalized}`;
};
var checkAudiencePresence = (audPayload, audOption) => typeof audPayload == "string" ? audOption.includes(audPayload) : Array.isArray(audPayload) ? audOption.some((aud) => audPayload.includes(aud)) : !1;
function validateNumericDate(claimsSet, claim, required = !1) {
	const value = claimsSet[claim];
	if (!(value === void 0 && !required)) {
		if (typeof value != "number") throw new JWTClaimValidationFailed(`"${claim}" claim must be a number`, claimsSet, claim, "invalid");
		return value;
	}
}
function unexpectedClaim(claimsSet, claim) {
	throw new JWTClaimValidationFailed(`unexpected "${claim}" claim value`, claimsSet, claim, checkFailed);
}
function validateClaimsSet(protectedHeader, claimsSetBytes, options = {}) {
	let claimsSet;
	try {
		claimsSet = JSON.parse(strictDecoder.decode(claimsSetBytes));
	} catch (cause) {
		throw new JWTInvalid("JWT Claims Set must be a top-level JSON object", { cause });
	}
	if (!isObject(claimsSet)) throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
	const { typ } = options;
	if (typ !== void 0 && (typeof protectedHeader.typ != "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) throw new JWTClaimValidationFailed("unexpected \"typ\" JWT header value", claimsSet, "typ", checkFailed);
	const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options, presenceCheck = [...requiredClaims];
	maxTokenAge !== void 0 && presenceCheck.push("iat"), audience !== void 0 && presenceCheck.push("aud"), subject !== void 0 && presenceCheck.push("sub"), issuer !== void 0 && presenceCheck.push("iss");
	for (const claim of new Set(presenceCheck.reverse())) if (!Object.hasOwn(claimsSet, claim)) throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, claimsSet, claim, "missing");
	issuer !== void 0 && !(Array.isArray(issuer) ? issuer : [issuer]).includes(claimsSet.iss) && unexpectedClaim(claimsSet, "iss"), subject !== void 0 && claimsSet.sub !== subject && unexpectedClaim(claimsSet, "sub"), audience !== void 0 && !checkAudiencePresence(claimsSet.aud, typeof audience == "string" ? [audience] : audience) && unexpectedClaim(claimsSet, "aud");
	const { clockTolerance } = options;
	let tolerance = 0;
	if (typeof clockTolerance == "string") tolerance = secs(clockTolerance);
	else if (clockTolerance !== void 0) {
		if (typeof clockTolerance != "number") throw new TypeError("Invalid clockTolerance option type");
		tolerance = clockTolerance;
	}
	if (validateInput("clockTolerance option", tolerance), tolerance < 0) throw new TypeError("Invalid clockTolerance option input");
	const { currentDate } = options, now = validateInput("currentDate option", epoch(currentDate === void 0 ? /* @__PURE__ */ new Date() : currentDate)), iat = validateNumericDate(claimsSet, "iat", maxTokenAge !== void 0), nbf = validateNumericDate(claimsSet, "nbf");
	if (nbf !== void 0 && nbf > now + tolerance) throw new JWTClaimValidationFailed("\"nbf\" claim timestamp check failed", claimsSet, "nbf", checkFailed);
	const exp = validateNumericDate(claimsSet, "exp");
	if (exp !== void 0 && exp <= now - tolerance) throw new JWTExpired("\"exp\" claim timestamp check failed", claimsSet, "exp", checkFailed);
	if (maxTokenAge !== void 0) {
		const age = now - iat, max = validateInput("maxTokenAge option", typeof maxTokenAge == "number" ? maxTokenAge : secs(maxTokenAge));
		if (max < 0) throw new TypeError("Invalid maxTokenAge option input");
		if (age - tolerance > max) throw new JWTExpired("\"iat\" claim timestamp check failed (too far in the past)", claimsSet, "iat", checkFailed);
		if (age < -tolerance) throw new JWTClaimValidationFailed("\"iat\" claim timestamp check failed (it should be in the past)", claimsSet, "iat", checkFailed);
	}
	return claimsSet;
}
// ../../node_modules/jose/dist/webapi/jwt/verify.js
async function jwtVerify(jwt, key, options) {
	const [verified, b64] = await verifyCompact(jwt, prepareVerify(options), key);
	if (!b64) throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
	const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
	return {
		...verified,
		payload
	};
}
// ../../node_modules/jose/dist/webapi/lib/key_algorithm.js
var algArgument = "\"alg\" (Algorithm)";
function unsupportedAlg(source = "JWK \"alg\" (Algorithm) Parameter") {
	throw new JOSENotSupported(`Invalid or unsupported ${source} value`);
}
function keyAlgorithm(alg, source) {
	return (typeof alg == "string" ? JWS[alg] ?? JWE[alg] : void 0) ?? unsupportedAlg(source);
}
// ../../node_modules/jose/dist/webapi/lib/asn1.js
var bytesEqual = (a, b) => {
	if (a.byteLength !== b.length) return !1;
	for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return !1;
	return !0;
};
var createASN1State = (data) => ({
	data,
	pos: 0
});
var readByte = (state) => {
	const byte = state.data[state.pos++];
	if (byte === void 0) throw new Error("Unexpected end of ASN.1 input");
	return byte;
};
var parseLength = (state) => {
	const first = readByte(state);
	if (first & 128) {
		const lengthOfLen = first & 127;
		let length = 0;
		for (let i = 0; i < lengthOfLen; i++) length = length << 8 | readByte(state);
		return length;
	}
	return first;
};
var skipElement = (state, count = 1) => {
	for (; count-- > 0;) {
		state.pos++;
		const length = parseLength(state);
		state.pos += length;
	}
};
var expectTag = (state, expectedTag, errorMessage) => {
	if (readByte(state) !== expectedTag) throw new Error(errorMessage);
};
var getSubarray = (state, length) => {
	if (length < 0 || state.pos + length > state.data.length) throw new Error("Unexpected end of ASN.1 input");
	const result = state.data.subarray(state.pos, state.pos + length);
	return state.pos += length, result;
};
var parseAlgorithmOID = (state) => {
	expectTag(state, 6, "Expected algorithm OID");
	return getSubarray(state, parseLength(state));
};
function parseKeyHeader(state, keyFormat) {
	if (expectTag(state, 48, `Invalid ${keyFormat === "spki" ? "SPKI" : "PKCS#8"} structure`), parseLength(state), keyFormat === "pkcs8") {
		expectTag(state, 2, "Expected version field");
		const length = parseLength(state);
		state.pos += length;
	}
	expectTag(state, 48, "Expected algorithm identifier"), parseLength(state);
}
var parseECAlgorithmIdentifier = (state) => {
	const algOid = parseAlgorithmOID(state);
	if (bytesEqual(algOid, [
		43,
		101,
		110
	])) return "X25519";
	if (!bytesEqual(algOid, [
		42,
		134,
		72,
		206,
		61,
		2,
		1
	])) throw new Error("Unsupported key algorithm");
	expectTag(state, 6, "Expected curve OID");
	const curveOid = getSubarray(state, parseLength(state));
	if (bytesEqual(curveOid, [
		42,
		134,
		72,
		206,
		61,
		3,
		1,
		7
	])) return "P-256";
	if (bytesEqual(curveOid, [
		43,
		129,
		4,
		0,
		34
	])) return "P-384";
	if (bytesEqual(curveOid, [
		43,
		129,
		4,
		0,
		35
	])) return "P-521";
	throw new Error("Unsupported named curve");
};
var genericImport = async (keyFormat, keyData, alg, options) => {
	const extractable = validateExtractableOption(options?.extractable), entry = keyAlgorithm(alg, algArgument);
	entry.secret && unsupportedAlg("\"alg\" (Algorithm)");
	const isPublic = keyFormat === "spki";
	let algorithm;
	if (entry.resolve) try {
		const state = createASN1State(keyData);
		parseKeyHeader(state, keyFormat), algorithm = entry.resolve({ crv: parseECAlgorithmIdentifier(state) });
	} catch (cause) {
		throw new JOSENotSupported("Invalid or unsupported key format", { cause });
	}
	else algorithm = entry.subtle;
	return crypto.subtle.importKey(keyFormat, keyData, algorithm, extractable ?? isPublic, entry.usages[isPublic ? 0 : 1]);
};
var processPEMData = (pem, pattern) => decodeBase64(pem.replace(pattern, ""));
function spkiFromX509(buf) {
	const state = createASN1State(buf);
	expectTag(state, 48, "Invalid certificate structure");
	const certificateLength = parseLength(state);
	if (certificateLength < 0 || state.pos + certificateLength > state.data.length) throw new Error("Unexpected end of ASN.1 input");
	expectTag(state, 48, "Invalid tbsCertificate structure"), parseLength(state), buf[state.pos] === 160 ? skipElement(state, 6) : skipElement(state, 5);
	const spkiStart = state.pos;
	expectTag(state, 48, "Invalid SPKI structure");
	const spkiContentLen = parseLength(state);
	return buf.subarray(spkiStart, spkiStart + spkiContentLen + (state.pos - spkiStart));
}
var fromX509 = (pem, alg, options) => {
	let spki;
	try {
		spki = spkiFromX509(processPEMData(pem, /(?:-----(?:BEGIN|END) CERTIFICATE-----|\s)/g));
	} catch (cause) {
		throw new TypeError("Failed to parse the X.509 certificate", { cause });
	}
	return genericImport("spki", spki, alg, options);
};
// ../../node_modules/jose/dist/webapi/key/import.js
async function importX509(x509, alg, options) {
	if (typeof x509 != "string" || x509.indexOf("-----BEGIN CERTIFICATE-----") !== 0) throw new TypeError("\"x509\" must be X.509 formatted string");
	return fromX509(x509, alg, options);
}
// ../../node_modules/jose/dist/webapi/util/decode_protected_header.js
function decodeProtectedHeader(token) {
	let encodedProtectedHeader;
	if (typeof token == "string") {
		const parts = token.split(".");
		(parts.length === 3 || parts.length === 5) && ([encodedProtectedHeader] = parts);
	} else if (typeof token == "object" && token) if ("protected" in token) encodedProtectedHeader = token.protected;
	else throw new TypeError("Token does not contain a Protected Header");
	const invalid = "Invalid Token or Protected Header formatting";
	if (typeof encodedProtectedHeader != "string" || !encodedProtectedHeader) throw new TypeError(invalid);
	return parseJoseHeader(encodedProtectedHeader, TypeError, invalid);
}
// src/auth.ts
var FIREBASE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
var AuthError = class extends Error {
	constructor(message = "Invalid or expired login. Please sign in again.") {
		super(message);
	}
};
async function getFirebaseCertificate(kid) {
	const cache = await caches.open("campusgigs-firebase-certs");
	let response = await cache.match(FIREBASE_CERTS_URL);
	if (!response) {
		const fresh = await fetch(FIREBASE_CERTS_URL);
		if (!fresh.ok) throw new Error("Firebase signing keys unavailable");
		const maxAgeHeader = fresh.headers.get("cache-control")?.match(/max-age=(\d+)/i)?.[1];
		const ttlSeconds = Math.min(Math.max(Number(maxAgeHeader || 300), 30), 3600);
		const headers = new Headers(fresh.headers);
		headers.set("cache-control", `public, max-age=${ttlSeconds}`);
		response = new Response(fresh.body, { headers });
		await cache.put(FIREBASE_CERTS_URL, response.clone());
	}
	const certs = await response.json();
	if (!certs || typeof certs !== "object" || Array.isArray(certs)) throw new Error("Invalid certificate response");
	const value = certs[kid];
	if (typeof value !== "string") throw new AuthError("Token signing key is not recognised");
	return value;
}
async function verifyFirebaseToken(request, projectId) {
	if (!projectId || projectId.startsWith("SET_")) throw new Error("Firebase project not configured");
	const authHeader = request.headers.get("authorization") || "";
	if (!authHeader.startsWith("Bearer ") || authHeader.length > 8192) throw new AuthError();
	const rawToken = authHeader.slice(7).trim();
	if (rawToken.split(".").length !== 3) throw new AuthError();
	try {
		const header = decodeProtectedHeader(rawToken);
		if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) throw new AuthError();
		const { payload } = await jwtVerify(rawToken, await importX509(await getFirebaseCertificate(header.kid), "RS256"), {
			algorithms: ["RS256"],
			issuer: `https://securetoken.google.com/${projectId}`,
			audience: projectId,
			requiredClaims: [
				"exp",
				"iat",
				"auth_time",
				"sub"
			],
			clockTolerance: 10
		});
		const claims = payload;
		const now = Math.floor(Date.now() / 1e3);
		if (typeof claims.sub !== "string" || claims.sub.length < 1 || claims.sub.length > 128 || typeof claims.auth_time !== "number" || claims.auth_time > now + 10 || typeof payload.iat === "number" && payload.iat > now + 10 || claims.firebase?.sign_in_provider === "anonymous") throw new AuthError();
		return {
			uid: claims.sub,
			email: typeof claims.email === "string" ? claims.email.toLowerCase() : "",
			emailVerified: claims.email_verified === true,
			displayName: typeof claims.name === "string" ? claims.name.slice(0, 80) : "",
			picture: typeof claims.picture === "string" ? claims.picture.slice(0, 1024) : ""
		};
	} catch (error) {
		if (error instanceof AuthError) throw error;
		throw new AuthError();
	}
}
// src/admin.ts
var AdminAccessError = class extends Error {
	constructor(message = "This workspace is available to verified CampusGigs administrators only.") {
		super(message);
	}
};
function assertAdminAccess(role, emailVerified, accountStatus) {
	if (role !== "admin" || !emailVerified || accountStatus !== "active") throw new AdminAccessError();
}
function parseMemberSearch(url) {
	const search = (url.searchParams.get("search") || "").trim();
	if (search.length > 80) throw new Error("Search must be 80 characters or fewer");
	const rawOffset = url.searchParams.get("offset") || "0";
	if (!/^\d{1,5}$/.test(rawOffset)) throw new Error("Invalid page offset");
	const offset = Number(rawOffset);
	if (!Number.isSafeInteger(offset) || offset > 2e4) throw new Error("Invalid page offset");
	return {
		search,
		offset,
		limit: 25
	};
}
function escapeLike(value) {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
// src/validation.ts
var InputError = class extends Error {};
function parseProfileUpdate(body) {
	if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Invalid profile data");
	const record = body;
	const keys = Object.keys(record);
	const permitted = [
		"displayName",
		"bio",
		"campus",
		"city",
		"avatarUrl"
	];
	if (keys.length < 1 || keys.some((key) => !permitted.includes(key))) throw new InputError("Unknown profile field");
	const clean = (name, max, min = 0) => {
		const value = record[name];
		if (value === void 0) return void 0;
		if (typeof value !== "string") throw new InputError(`${name} must be text`);
		const text = value.trim();
		if (text.length < min || text.length > max) throw new InputError(`${name} must be ${min}–${max} characters`);
		return text;
	};
	const displayName = clean("displayName", 60, 2);
	const bio = clean("bio", 480);
	const campus = clean("campus", 100);
	const city = clean("city", 100);
	const avatarUrl = clean("avatarUrl", 1024);
	if (avatarUrl && (!avatarUrl.startsWith("https://") || /[\x00-\x1f]/.test(avatarUrl))) throw new InputError("Avatar URL must use HTTPS");
	return {
		displayName,
		bio,
		campus,
		city,
		avatarUrl
	};
}
function parseMode(body) {
	if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Invalid mode");
	const record = body;
	if (Object.keys(record).length !== 1 || record.mode !== "buying" && record.mode !== "providing") throw new InputError("Mode must be buying or providing");
	return record.mode;
}
// src/institutions.ts
var nigeriaStates = [
	"Abia",
	"Adamawa",
	"Akwa Ibom",
	"Anambra",
	"Bauchi",
	"Bayelsa",
	"Benue",
	"Borno",
	"Cross River",
	"Delta",
	"Ebonyi",
	"Edo",
	"Ekiti",
	"Enugu",
	"FCT",
	"Gombe",
	"Imo",
	"Jigawa",
	"Kaduna",
	"Kano",
	"Katsina",
	"Kebbi",
	"Kogi",
	"Kwara",
	"Lagos",
	"Nasarawa",
	"Niger",
	"Ogun",
	"Ondo",
	"Osun",
	"Oyo",
	"Plateau",
	"Rivers",
	"Sokoto",
	"Taraba",
	"Yobe",
	"Zamfara"
];
var institutionIdPattern = /^[0-9a-f]{20}$/;
var publicProviderIdPattern = /^[0-9a-f]{32}$/;
function parseScope(searchParams, allowed) {
	for (const key of searchParams.keys()) if (!allowed.includes(key)) throw new InputError("Unknown search filter");
	const read = (key, max) => {
		const values = searchParams.getAll(key);
		if (values.length > 1 || (values[0] || "").length > max) throw new InputError(`Invalid ${key} filter`);
		return (values[0] || "").trim();
	};
	const state = read("state", 40);
	const institutionId = read("institutionId", 32);
	const q = read("q", 80);
	const rawLimit = read("limit", 2);
	if (state && !nigeriaStates.includes(state)) throw new InputError("Choose a recognised Nigerian state");
	if (institutionId && !institutionIdPattern.test(institutionId)) throw new InputError("Choose an institution from the directory");
	if (rawLimit && !/^\d{1,2}$/.test(rawLimit)) throw new InputError("Invalid limit");
	const limit = rawLimit ? Number(rawLimit) : 15;
	if (limit < 1 || limit > 24) throw new InputError("Invalid limit");
	return {
		state,
		institutionId,
		q,
		limit
	};
}
function likeTerm(input) {
	return `%${input.replace(/[\\%_]/g, "\\$&")}%`;
}
async function findInstitution(env, id) {
	if (!institutionIdPattern.test(id)) throw new InputError("Select a recognised institution");
	const institution = await env.DB.prepare("SELECT id,name,state_name,institution_type FROM institutions WHERE id=?").bind(id).first();
	if (!institution) throw new InputError("Institution not in our directory");
	return institution;
}
var onlineExpression = `(CASE WHEN p.show_online=1 AND p.last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 minutes') THEN 1 ELSE 0 END)`;
// src/providerValidation.ts
var skillCategories = [
	"Design & Creative",
	"Tech & Digital",
	"Media & Editing",
	"Personal Services",
	"Tutoring & Skills",
	"Typing & Proofreading",
	"Events & Lifestyle",
	"Business Support",
	"Barbing & Grooming",
	"Hairdressing & Braiding",
	"Makeup & Nails",
	"Tailoring & Fashion",
	"Electrical Services",
	"Phone & Gadget Repairs",
	"Computer Repairs",
	"Plumbing & Water Works",
	"Carpentry & Furniture",
	"Painting & Decoration",
	"Appliance Repairs",
	"Laundry & Cleaning",
	"Catering & Baking",
	"Food & Small Chops",
	"Photography & Videography",
	"Event Planning & Rentals",
	"Delivery & Errands",
	"Printing & Photocopy",
	"Automotive & Bike Services",
	"Agriculture & Gardening"
];
function recordOf(value, allowed) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Invalid form details");
	const record = value;
	if (Object.keys(record).some((key) => !allowed.includes(key))) throw new InputError("Unknown form field");
	return record;
}
function stringField(record, key, min, max) {
	const value = record[key];
	if (typeof value !== "string") throw new InputError(`${key} must be text`);
	const clean = value.trim().replace(/\s+/g, " ");
	if (clean.length < min || clean.length > max || /[\x00-\x1f]/.test(clean)) throw new InputError(`${key} must be ${min}–${max} characters`);
	return clean;
}
function parseProviderApplication(value) {
	const record = recordOf(value, [
		"categories",
		"locationKind",
		"locationName",
		"bio",
		"evidenceType",
		"evidenceKey"
	]);
	if (!Array.isArray(record.categories) || record.categories.length < 1 || record.categories.length > 4 || new Set(record.categories).size !== record.categories.length || record.categories.some((category) => !skillCategories.includes(category))) throw new InputError("Choose between one and four service categories");
	if (record.locationKind !== "campus" && record.locationKind !== "city") throw new InputError("Select campus or city");
	if (record.evidenceType !== "student_id" && record.evidenceType !== "government_id") throw new InputError("Select a valid ID type");
	return {
		categories: record.categories,
		locationKind: record.locationKind,
		locationName: stringField(record, "locationName", 3, 100),
		bio: stringField(record, "bio", 40, 800),
		evidenceType: record.evidenceType,
		evidenceKey: stringField(record, "evidenceKey", 20, 300)
	};
}
function parseGig(value) {
	const record = recordOf(value, [
		"title",
		"description",
		"category",
		"priceKobo",
		"deliveryDays",
		"locationType",
		"locationName",
		"paymentOption",
		"state",
		"institutionId"
	]);
	if (!skillCategories.includes(record.category)) throw new InputError("Invalid category");
	if (!Number.isSafeInteger(record.priceKobo) || record.priceKobo < 1e4 || record.priceKobo > 1e9) throw new InputError("Price must be between ₦100 and ₦10,000,000");
	if (!Number.isSafeInteger(record.deliveryDays) || record.deliveryDays < 1 || record.deliveryDays > 90) throw new InputError("Delivery time must be 1–90 days");
	if (![
		"online",
		"in_person",
		"both"
	].includes(record.locationType)) throw new InputError("Invalid location type");
	if (![
		"full",
		"deposit",
		"preview"
	].includes(record.paymentOption)) throw new InputError("Invalid payment option");
	const title = stringField(record, "title", 8, 100);
	const description = stringField(record, "description", 40, 3e3);
	const locationName = stringField(record, "locationName", 3, 100);
	const state = stringField(record, "state", 2, 40);
	if (!nigeriaStates.includes(state)) throw new InputError("Choose a Nigerian state for this gig");
	const institutionId = record.institutionId === "" || record.institutionId === void 0 ? "" : stringField(record, "institutionId", 20, 20);
	if (institutionId && !institutionIdPattern.test(institutionId)) throw new InputError("Choose your institution from the directory");
	if (/\b(write|complete|do)\b.{0,35}\b(assignment|exam|thesis|dissertation|coursework)\b|\b(assignment|exam|thesis|dissertation|coursework)\b.{0,35}\b(for you|on your behalf)\b/i.test(`${title} ${description}`)) throw new InputError("Full academic assignment completion is not allowed. Offer tutoring or proofreading instead.");
	return {
		title,
		description,
		locationName,
		state,
		institutionId,
		category: record.category,
		priceKobo: record.priceKobo,
		deliveryDays: record.deliveryDays,
		locationType: record.locationType,
		paymentOption: record.paymentOption
	};
}
function parseReview(value) {
	const record = recordOf(value, ["decision", "note"]);
	if (![
		"approved",
		"rejected",
		"changes_requested"
	].includes(record.decision)) throw new InputError("Invalid review decision");
	const note = record.note === void 0 ? "" : stringField(record, "note", 0, 500);
	if (record.decision !== "approved" && note.length < 6) throw new InputError("Include a short reason for the applicant");
	return {
		decision: record.decision,
		note
	};
}
function parseModeration(value) {
	const record = recordOf(value, ["decision", "note"]);
	if (record.decision !== "removed" && record.decision !== "restored") throw new InputError("Invalid moderation action");
	const note = record.note === void 0 ? "" : stringField(record, "note", 0, 500);
	if (record.decision === "removed" && note.length < 6) throw new InputError("Explain why this gig is being removed");
	return {
		decision: record.decision,
		note
	};
}
// src/publicGigs.ts
var escaped = (input) => input.replace(/[\\%_]/g, "\\$&");
var tradeAliases = {
	barber: ["Barbing & Grooming"],
	barbing: ["Barbing & Grooming"],
	haircut: ["Barbing & Grooming"],
	braids: ["Hairdressing & Braiding"],
	braiding: ["Hairdressing & Braiding"],
	hairdresser: ["Hairdressing & Braiding"],
	electrician: ["Electrical Services"],
	wiring: ["Electrical Services"],
	phone: ["Phone & Gadget Repairs"],
	smartphone: ["Phone & Gadget Repairs"],
	laptop: ["Computer Repairs"],
	computer: ["Computer Repairs"],
	plumber: ["Plumbing & Water Works"],
	plumbing: ["Plumbing & Water Works"],
	tailor: ["Tailoring & Fashion"],
	sewing: ["Tailoring & Fashion"],
	cleaning: ["Laundry & Cleaning"],
	laundry: ["Laundry & Cleaning"],
	baker: ["Catering & Baking"],
	cakes: ["Catering & Baking"],
	printing: ["Printing & Photocopy"],
	photocopy: ["Printing & Photocopy"],
	dispatch: ["Delivery & Errands"],
	delivery: ["Delivery & Errands"],
	mechanic: ["Automotive & Bike Services"],
	vulcanizer: ["Automotive & Bike Services"],
	photographer: ["Photography & Videography"],
	photoshoot: ["Photography & Videography"]
};
function serviceSearchWords(query) {
	return query.trim().split(/\s+/u).filter(Boolean).slice(0, 6);
}
var single = (url, key, max) => {
	const values = url.searchParams.getAll(key);
	if (values.length > 1 || (values[0] || "").length > max) throw new InputError(`Invalid ${key} filter`);
	return (values[0] || "").trim();
};
function integerInRange(input, key, max) {
	if (!input) return null;
	if (!/^\d{1,10}$/.test(input)) throw new InputError(`Invalid ${key} filter`);
	const value = Number(input);
	if (!Number.isSafeInteger(value) || value > max) throw new InputError(`Invalid ${key} filter`);
	return value;
}
function parsePublicGigFilters(url) {
	for (const key of url.searchParams.keys()) if (![
		"q",
		"category",
		"location",
		"state",
		"institutionId",
		"locationType",
		"sort",
		"minPrice",
		"maxPrice",
		"limit",
		"offset"
	].includes(key)) throw new InputError("Unknown gig filter");
	const q = single(url, "q", 80);
	const category = single(url, "category", 60);
	const location = single(url, "location", 100);
	const state = single(url, "state", 40);
	const institutionId = single(url, "institutionId", 32);
	if (state && !nigeriaStates.includes(state)) throw new InputError("Choose a recognised state");
	if (institutionId && !institutionIdPattern.test(institutionId)) throw new InputError("Choose a recognised campus");
	const locationType = single(url, "locationType", 16);
	const sort = single(url, "sort", 12) || "newest";
	if (category && !skillCategories.includes(category)) throw new InputError("Invalid category filter");
	if (locationType && ![
		"online",
		"in_person",
		"both"
	].includes(locationType)) throw new InputError("Invalid location type");
	if (![
		"newest",
		"price_low",
		"price_high",
		"fastest"
	].includes(sort)) throw new InputError("Invalid sort order");
	const minPrice = integerInRange(single(url, "minPrice", 10), "minPrice", 1e7);
	const maxPrice = integerInRange(single(url, "maxPrice", 10), "maxPrice", 1e7);
	if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) throw new InputError("Minimum price must not exceed maximum price");
	const limit = integerInRange(single(url, "limit", 2), "limit", 24) ?? 12;
	const offset = integerInRange(single(url, "offset", 7), "offset", 1e6) ?? 0;
	if (limit < 1) throw new InputError("Invalid limit filter");
	return {
		q,
		category,
		location,
		state,
		institutionId,
		locationType,
		sort,
		minPrice,
		maxPrice,
		limit,
		offset
	};
}
var publicGigWhere = `g.status = 'active' AND pp.provider_status = 'active' AND p.account_status = 'active'`;
function publicGigQuery(filters) {
	const where = [publicGigWhere];
	const params = [];
	if (filters.q) for (const word of serviceSearchWords(filters.q)) {
		const pattern = `%${escaped(word.replace(/^@/, ""))}%`;
		const words = [
			`g.title LIKE ? ESCAPE '\\'`,
			`g.description LIKE ? ESCAPE '\\'`,
			`g.category LIKE ? ESCAPE '\\'`,
			`p.display_name LIKE ? ESCAPE '\\'`,
			`g.location_name LIKE ? ESCAPE '\\'`,
			`p.campus LIKE ? ESCAPE '\\'`,
			`p.cg_username LIKE ? ESCAPE '\\'`
		];
		params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
		const aliases = tradeAliases[word.toLowerCase()] || [];
		for (const category of aliases) {
			words.push("g.category = ?");
			params.push(category);
		}
		where.push(`(${words.join(" OR ")})`);
	}
	if (filters.category) {
		where.push("g.category = ?");
		params.push(filters.category);
	}
	if (filters.state) {
		where.push("g.state_name = ?");
		params.push(filters.state);
	}
	if (filters.institutionId) {
		where.push("g.institution_id = ?");
		params.push(filters.institutionId);
	}
	if (filters.location) {
		const pattern = `%${escaped(filters.location)}%`;
		where.push(`(g.location_name LIKE ? ESCAPE '\\' OR p.campus LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\')`);
		params.push(pattern, pattern, pattern);
	}
	if (filters.locationType) {
		if (filters.locationType === "both") where.push(`g.location_type = 'both'`);
		else {
			where.push("(g.location_type = ? OR g.location_type = 'both')");
			params.push(filters.locationType);
		}
	}
	if (filters.minPrice !== null) {
		where.push("g.price_kobo >= ?");
		params.push(filters.minPrice * 100);
	}
	if (filters.maxPrice !== null) {
		where.push("g.price_kobo <= ?");
		params.push(filters.maxPrice * 100);
	}
	const orders = {
		newest: "g.created_at DESC, g.id DESC",
		price_low: "g.price_kobo ASC, g.id DESC",
		price_high: "g.price_kobo DESC, g.id DESC",
		fastest: "g.delivery_days ASC, g.id DESC"
	};
	const q = filters.q.trim().replace(/^@/, "");
	const ranking = filters.sort === "newest" && q ? `CASE WHEN lower(p.cg_username)=lower(?) THEN 0
      WHEN lower(g.title)=lower(?) THEN 1
      WHEN lower(g.category)=lower(?) THEN 2
      WHEN lower(p.display_name)=lower(?) THEN 3
      WHEN lower(p.cg_username) LIKE lower(?) ESCAPE '\\' THEN 4
      WHEN lower(g.title) LIKE lower(?) ESCAPE '\\' THEN 5
      ELSE 6 END ASC, ` : "";
	if (ranking) params.push(q, q, q, q, `${escaped(q)}%`, `${escaped(q)}%`);
	return {
		sql: `WHERE ${where.join(" AND ")} ORDER BY ${ranking}${orders[filters.sort]} LIMIT ? OFFSET ?`,
		params: [
			...params,
			filters.limit + 1,
			filters.offset
		]
	};
}
// src/academicValidation.ts
function parseAcademics(facultyInput, departmentInput) {
	if (typeof facultyInput !== "string" || typeof departmentInput !== "string") throw new InputError("Choose a faculty and department, or leave both blank");
	const faculty = facultyInput.trim().replace(/\s+/g, " ");
	const department = departmentInput.trim().replace(/\s+/g, " ");
	if (faculty && !department || !faculty && department) throw new InputError("Enter both faculty and department");
	for (const value of [faculty, department]) if (value.length > 80 || /[\x00-\x1f<>]/.test(value) || value && value.length < 2) throw new InputError("Faculty and department must be 2–80 characters without markup");
	return {
		faculty,
		department
	};
}
// src/academicCatalog.ts
var schoolCatalogs = {
	"6879021fc76ef50a3d30": {
		sourceUrl: "https://www.ndu.edu.ng/undergraduate",
		faculties: {
			"Arts": [
				"English & Literary Studies",
				"History & Diplomacy",
				"Philosophy",
				"Religious Studies",
				"Theatre Arts"
			],
			"Agriculture": [
				"Agricultural Economics",
				"Crop & Soil Science",
				"Fisheries and Aquatic Studies",
				"Agricultural Extension & Rural Sociology"
			],
			"Environmental Sciences": [
				"Architecture",
				"Fine & Applied Arts",
				"Quantity Surveying",
				"Environmental Management",
				"Urban & Regional Planning",
				"Building",
				"Estate Management"
			],
			"Engineering": [
				"Agricultural / Environmental Engineering",
				"Chemical / Petrochemical Engineering",
				"Civil Engineering",
				"Electrical / Electronic Engineering",
				"Mechanical Engineering",
				"Marine Engineering",
				"Petroleum Engineering"
			],
			"Education": [
				"Arts Education",
				"Science Education",
				"Social Science Education",
				"Educational Foundations",
				"Vocational & Technical Education",
				"Counseling & Educational Psychology",
				"Library & Information Science",
				"Educational Management"
			],
			"Law": ["Law"],
			"Management Sciences": [
				"Accounting",
				"Banking & Finance",
				"Insurance",
				"Business Administration",
				"Management",
				"Marketing",
				"Office & Information Management"
			],
			"Nursing Sciences": [
				"Community Health Nursing",
				"Medical-Surgical Nursing",
				"Maternal & Child Health Nursing",
				"Mental Health / Psychiatric Nursing"
			],
			"Pharmacy": [
				"Clinical Pharmacy & Pharmacy Practice",
				"Pharmacology & Toxicology",
				"Pharmaceutical Chemistry",
				"Pharmacognosy & Herbal Medicine",
				"Pharmaceutics & Pharmaceutical Technology",
				"Pharmaceutical Microbiology & Biotechnology"
			],
			"Sciences": [
				"Biological Sciences",
				"Chemical Sciences",
				"Computer Science",
				"Geology",
				"Mathematics",
				"Microbiology",
				"Physics"
			],
			"Social Sciences": [
				"Economics",
				"Geography & Environmental Management",
				"Mass Communication",
				"Political Science",
				"Sociology"
			],
			"Basic Medical Sciences": [
				"Biochemistry",
				"Anatomy",
				"Physiology",
				"Pathology",
				"Pharmacology",
				"Medical Laboratory Science"
			],
			"Clinical Sciences": [
				"Community Medicine & Public Health",
				"Family Medicine",
				"Radiology",
				"Dentistry",
				"Surgery",
				"Medicine",
				"Obstetrics & Gynaecology",
				"Paediatrics",
				"Psychiatry & Mental Health"
			]
		}
	},
	"2fa2c2a9d90565f4ef37": {
		sourceUrl: "https://unilag.edu.ng/when-the-future-calls-unilag-answers-with-new-faculties-and-a-new-vision/",
		faculties: {
			"Architecture": [
				"Architecture",
				"Landscape Architecture and Urban Design",
				"Interior Architecture and Design"
			],
			"Arts": [
				"English",
				"European Languages and Integration Studies",
				"History and Strategic Studies",
				"Linguistics, African and Asian Studies",
				"Philosophy",
				"Religious Studies"
			],
			"Basic Clinical Sciences": [
				"Anatomic and Molecular Pathology",
				"Haematology and Blood Transfusion",
				"Medical Microbiology and Parasitology",
				"Clinical Pathology",
				"Clinical Pharmacology"
			],
			"Basic Medical Sciences": [
				"Anatomy",
				"Physiology",
				"Medical Biochemistry",
				"Pharmacology, Therapeutics and Toxicology"
			],
			"Clinical Sciences": [
				"Anaesthesia",
				"Community Health and Primary Care",
				"Medicine",
				"Obstetrics and Gynaecology",
				"Ophthalmology",
				"Paediatrics",
				"Psychiatry",
				"Radiation Biology, Radiotherapy and Radiodiagnosis",
				"Surgery"
			],
			"Communication and Media Studies": [
				"Mass Communication",
				"Public Relations and Advertising",
				"Journalism, Broadcasting and Media Studies"
			],
			"Computing and Informatics": [
				"Computer Science",
				"Intelligent Systems and Robotics",
				"Cybersecurity and Software Engineering"
			],
			"Creative Arts": [
				"Music and Sound Production",
				"Theatre Arts and Film Studies",
				"Fine and Applied Arts"
			],
			"Dental Sciences": [
				"Child Dental Health",
				"Oral and Maxillofacial Pathology/Biology",
				"Oral and Maxillofacial Surgery",
				"Preventive Dentistry",
				"Restorative Dentistry"
			],
			"Education": [
				"Adult Education",
				"Arts Education",
				"Educational Foundations",
				"Educational Management",
				"Human Kinetics and Health Education",
				"Science Education",
				"Social Sciences Education",
				"Technology and Vocational Education"
			],
			"Engineering": [
				"Biomedical Engineering",
				"Chemical Engineering",
				"Petroleum and Gas Engineering",
				"Civil and Environmental Engineering",
				"Electrical and Electronics Engineering",
				"Mechanical Engineering",
				"Metallurgical and Materials Engineering",
				"Surveying and Geoinformatics",
				"Systems Engineering"
			],
			"Environmental Sciences": [
				"Building",
				"Estate Management",
				"Quantity Surveying",
				"Urban and Regional Planning"
			],
			"Health Professions": [
				"Medical Laboratory Science",
				"Nursing Science",
				"Physiotherapy",
				"Radiography"
			],
			"Law": [
				"Commercial and Industrial Law",
				"Jurisprudence and International Law",
				"Private and Property Law",
				"Public Law"
			],
			"Life Sciences": [
				"Biochemistry",
				"Botany",
				"Cell Biology and Genetics",
				"Marine Science",
				"Microbiology",
				"Zoology",
				"Fisheries and Aquaculture"
			],
			"Management Sciences": [
				"Accounting",
				"Actuarial Science and Insurance",
				"Business Administration",
				"Employment Relations and Human Resource Management",
				"Finance"
			],
			"Pharmacy": [
				"Clinical Pharmacy and Biopharmacy",
				"Pharmaceutical Chemistry",
				"Pharmaceutical Microbiology and Biotechnology",
				"Pharmaceutics and Pharmaceutical Technology",
				"Pharmacognosy"
			],
			"Physical and Earth Sciences": [
				"Chemistry",
				"Geosciences",
				"Mathematics",
				"Physics",
				"Statistics"
			],
			"Social Sciences": [
				"Economics",
				"Geography",
				"Library and Information Science",
				"Political Science",
				"Psychology",
				"Social Work",
				"Sociology"
			]
		}
	}
};
function publicAcademicCatalog(institutionId) {
	const catalog = schoolCatalogs[institutionId];
	return catalog ? {
		verified: true,
		sourceUrl: catalog.sourceUrl,
		faculties: catalog.faculties
	} : {
		verified: false,
		sourceUrl: null,
		faculties: {}
	};
}
function validateSchoolAcademics(institutionId, faculty, department, legacy) {
	const normalized = parseAcademics(faculty, department);
	const catalog = schoolCatalogs[institutionId];
	if (!catalog || !normalized.faculty) return normalized;
	if (legacy?.institutionId === institutionId && legacy.faculty === normalized.faculty && legacy.department === normalized.department) return normalized;
	const facultyName = Object.keys(catalog.faculties).find((name) => name.toLocaleLowerCase() === normalized.faculty.toLocaleLowerCase());
	const departmentName = facultyName && catalog.faculties[facultyName].find((name) => name.toLocaleLowerCase() === normalized.department.toLocaleLowerCase());
	if (!facultyName || !departmentName) throw new InputError("Select a faculty and its department from this institution’s verified list");
	return {
		faculty: facultyName,
		department: departmentName
	};
}
// src/phaseB.ts
var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var publicGigFields = "g.id,g.title,g.description,g.category,g.price_kobo,g.delivery_days,g.location_type,g.location_name,g.payment_option,g.status,g.created_at,g.updated_at,g.state_name,g.institution_id";
function needsAuth(user) {
	if (!user) throw new InputError("Sign in to continue");
	return user;
}
function mustHaveVerifiedEmail(user) {
	const identity = needsAuth(user);
	if (!identity.emailVerified) throw new InputError("Verify your email address before applying or publishing");
	return identity;
}
function requireAdmin(context) {
	if (!context.isAdmin) throw new InputError("Administrator access required");
	return needsAuth(context.user);
}
function serializeApplication(row) {
	if (!row) return null;
	const data = row;
	return {
		id: data.id,
		firebase_uid: data.firebase_uid,
		display_name: data.display_name,
		email: data.email,
		location_name: data.location_name,
		location_kind: data.location_kind,
		bio: data.bio,
		evidence_type: data.evidence_type,
		status: data.status,
		revision: data.revision,
		review_note: data.review_note,
		submitted_at: data.submitted_at,
		updated_at: data.updated_at,
		categories: JSON.parse(data.skill_categories)
	};
}
function mediaFormat(request) {
	const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
	const formats = {
		"image/jpeg": "jpg",
		"image/png": "png",
		"image/webp": "webp"
	};
	if (!type || !formats[type]) throw new InputError("Use a JPEG, PNG or WebP image");
	return {
		type,
		ext: formats[type]
	};
}
async function readImage(request) {
	const { type, ext } = mediaFormat(request);
	const maxBytes = 4194304;
	if (Number(request.headers.get("content-length") || 0) > maxBytes) throw new InputError("Image must be 4 MB or smaller");
	const reader = request.body?.getReader();
	if (!reader) throw new InputError("Choose an image");
	const chunks = [];
	let size = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			throw new InputError("Image must be 4 MB or smaller");
		}
		chunks.push(value);
	}
	if (size < 40) throw new InputError("Image is empty or invalid");
	const bytes = new Uint8Array(size);
	let cursor = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, cursor);
		cursor += chunk.length;
	}
	if (!(type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : type === "image/png" ? [
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	].every((byte, index) => bytes[index] === byte) : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")) throw new InputError("Image contents do not match its file type");
	return {
		bytes,
		type,
		ext
	};
}
function imageResponse(object) {
	return new Response(object.body, { headers: {
		"Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff",
		"Content-Security-Policy": "default-src 'none'; sandbox"
	} });
}
function resultRows(data) {
	return data.results || [];
}
async function phaseB(context) {
	const { request, url, env, json, user } = context;
	const path = url.pathname;
	if (path === "/v1/public/institutions" && request.method === "GET") {
		const filters = parseScope(url.searchParams, [
			"q",
			"state",
			"limit"
		]);
		return json({ institutions: (await env.DB.prepare(`SELECT id,name,state_name,institution_type,aliases FROM institutions
      WHERE (?='' OR state_name=?) AND (?='' OR name LIKE ? ESCAPE '\\' OR aliases LIKE ? ESCAPE '\\')
      ORDER BY CASE
        WHEN lower(name)=lower(?) THEN 0
        WHEN instr(' ' || lower(aliases) || ' ', ' ' || lower(?) || ' ')>0 THEN 1
        WHEN lower(name) LIKE lower(?) ESCAPE '\\' THEN 2
        ELSE 3 END,name LIMIT ?`).bind(filters.state, filters.state, filters.q, likeTerm(filters.q), likeTerm(filters.q), filters.q, filters.q, `${filters.q.replace(/[\\%_]/g, "\\$&")}%`, filters.limit).all()).results || [] });
	}
	const academicMatch = path.match(/^\/v1\/public\/institutions\/([0-9a-f]{20})\/academics$/);
	if (academicMatch && request.method === "GET") {
		if ([...url.searchParams.keys()].length) throw new InputError("Unknown academic filter");
		const institution = await findInstitution(env, academicMatch[1]);
		return json({
			institutionId: institution.id,
			institutionName: institution.name,
			...publicAcademicCatalog(institution.id)
		});
	}
	if (path === "/v1/public/providers" && request.method === "GET") {
		const filters = parseScope(url.searchParams, [
			"q",
			"state",
			"institutionId",
			"limit"
		]);
		const queryPattern = filters.q ? `%${filters.q.trim().split(/\s+/).map((word) => likeTerm(word).slice(1, -1)).join("%")}%` : "%";
		if (filters.institutionId) {
			const institution = await findInstitution(env, filters.institutionId);
			if (filters.state && institution.state_name !== filters.state) throw new InputError("Institution is outside the selected state");
		}
		const query = `SELECT pp.public_id,p.display_name,p.cg_username,p.avatar_url,p.bio,p.campus,p.city,p.state_name,p.institution_id,
      pp.verified_at,${onlineExpression} AS online,
      (SELECT COUNT(*) FROM provider_follows f WHERE f.provider_uid=pp.firebase_uid) AS follower_count,
      (SELECT COUNT(*) FROM gigs g WHERE g.provider_uid=pp.firebase_uid AND g.status='active') AS gig_count
      FROM provider_profiles pp JOIN profiles p ON p.firebase_uid=pp.firebase_uid
      WHERE pp.provider_status='active' AND pp.public_id IS NOT NULL AND p.account_status='active'
        AND (?='' OR p.state_name=?) AND (?='' OR p.institution_id=?)
        AND (?='' OR p.display_name LIKE ? ESCAPE '\\' OR p.cg_username LIKE ? ESCAPE '\\' OR p.campus LIKE ? ESCAPE '\\' OR p.bio LIKE ? ESCAPE '\\'
          OR EXISTS(SELECT 1 FROM provider_applications a WHERE a.firebase_uid=pp.firebase_uid AND a.skill_categories LIKE ? ESCAPE '\\')
          OR EXISTS(SELECT 1 FROM gigs search_gig WHERE search_gig.provider_uid=pp.firebase_uid
            AND search_gig.status='active' AND (search_gig.category LIKE ? ESCAPE '\\' OR search_gig.title LIKE ? ESCAPE '\\')))
      ORDER BY online DESC, gig_count DESC,pp.verified_at DESC LIMIT ?`;
		return json({ providers: (await env.DB.prepare(query).bind(filters.state, filters.state, filters.institutionId, filters.institutionId, filters.q, queryPattern, queryPattern, queryPattern, queryPattern, queryPattern, queryPattern, queryPattern, filters.limit).all()).results || [] });
	}
	const publicProvider = path.match(/^\/v1\/public\/providers\/([0-9a-f]{32})$/i);
	if (publicProvider && request.method === "GET") {
		if (!publicProviderIdPattern.test(publicProvider[1])) return json({ error: "Not found" }, 404);
		const provider = await env.DB.prepare(`SELECT pp.firebase_uid AS private_uid,pp.public_id,p.display_name,p.cg_username,p.avatar_url,
      p.bio,p.campus,p.city,p.state_name,p.institution_id,pp.verified_at,${onlineExpression} AS online,
      (SELECT COUNT(*) FROM provider_follows f WHERE f.provider_uid=pp.firebase_uid) AS follower_count,
      (SELECT COUNT(*) FROM service_reviews r WHERE r.provider_uid=pp.firebase_uid) AS review_count,
      (SELECT ROUND(AVG(r.rating),1) FROM service_reviews r WHERE r.provider_uid=pp.firebase_uid) AS rating_average,
      COALESCE((SELECT a.accepting_bookings FROM provider_availability a WHERE a.provider_uid=pp.firebase_uid),1) AS accepting_bookings
      FROM provider_profiles pp JOIN profiles p ON p.firebase_uid=pp.firebase_uid
      WHERE pp.public_id=? AND pp.provider_status='active' AND p.account_status='active'`).bind(publicProvider[1]).first();
		if (!provider) return json({ error: "Provider not found" }, 404);
		const gigs = await env.DB.prepare(`SELECT ${publicGigFields},p.display_name AS provider_name, pp.public_id AS provider_public_id,
      p.campus AS provider_campus, pp.verified_at,
      (SELECT id FROM gig_images WHERE gig_id=g.id ORDER BY created_at LIMIT 1) AS cover_image_id
      FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid
      JOIN profiles p ON p.firebase_uid=g.provider_uid WHERE g.provider_uid=? AND ${publicGigWhere}
      ORDER BY g.created_at DESC LIMIT 24`).bind(provider.private_uid).all();
		const { private_uid: _hidden, ...publicDetails } = provider;
		return json({
			provider: publicDetails,
			gigs: gigs.results || []
		});
	}
	if (path === "/v1/public/gigs" && request.method === "GET") {
		const filters = parsePublicGigFilters(url);
		if (filters.institutionId) {
			const institution = await findInstitution(env, filters.institutionId);
			if (filters.state && institution.state_name !== filters.state) throw new InputError("Institution is outside the selected state");
		}
		const query = publicGigQuery(filters);
		const rows = (await env.DB.prepare(`
      SELECT ${publicGigFields}, p.display_name AS provider_name, p.cg_username AS provider_username, pp.public_id AS provider_public_id,
        (CASE WHEN p.show_online=1 AND p.last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 minutes') THEN 1 ELSE 0 END) AS provider_online,pp.verified_at, p.campus AS provider_campus,
        (SELECT id FROM gig_images WHERE gig_id = g.id ORDER BY created_at LIMIT 1) AS cover_image_id
      FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid = g.provider_uid
      JOIN profiles p ON p.firebase_uid = g.provider_uid
      ${query.sql}
    `).bind(...query.params).all()).results || [];
		return json({
			gigs: rows.slice(0, filters.limit),
			nextOffset: rows.length > filters.limit ? filters.offset + filters.limit : null,
			paymentsEnabled: false
		});
	}
	const publicDetail = path.match(/^\/v1\/public\/gigs\/([0-9a-f-]+)$/i);
	if (publicDetail && request.method === "GET") {
		const gigId = publicDetail[1];
		if (!uuidPattern.test(gigId)) return json({ error: "Not found" }, 404);
		const gig = await env.DB.prepare(`
      SELECT ${publicGigFields}, p.display_name AS provider_name, p.cg_username AS provider_username, p.avatar_url AS provider_avatar,
        pp.public_id AS provider_public_id,${onlineExpression} AS provider_online,
        COALESCE((SELECT a.accepting_bookings FROM provider_availability a WHERE a.provider_uid=g.provider_uid),1) AS accepting_bookings,
        p.bio AS provider_bio, p.campus AS provider_campus, p.city AS provider_city, pp.verified_at
      FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid = g.provider_uid
      JOIN profiles p ON p.firebase_uid = g.provider_uid
      WHERE g.id = ? AND ${publicGigWhere}
    `).bind(gigId).first();
		if (!gig) return json({ error: "Gig not found" }, 404);
		const [images, related] = await Promise.all([env.DB.prepare("SELECT id FROM gig_images WHERE gig_id = ? ORDER BY created_at ASC LIMIT 8").bind(gigId).all(), env.DB.prepare(`
        SELECT g.id,g.title,g.category,g.price_kobo,g.delivery_days,g.location_type,
          p.display_name AS provider_name, pp.verified_at,
          (SELECT id FROM gig_images WHERE gig_id = g.id ORDER BY created_at LIMIT 1) AS cover_image_id
        FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid = g.provider_uid
        JOIN profiles p ON p.firebase_uid = g.provider_uid
        WHERE g.id != ? AND g.category = ? AND ${publicGigWhere}
        ORDER BY g.created_at DESC LIMIT 3
      `).bind(gigId, gig.category).all()]);
		return json({
			gig,
			images: (images.results || []).map((image) => image.id),
			related: related.results || [],
			paymentsEnabled: false
		});
	}
	const publicImage = path.match(/^\/v1\/public\/gigs\/([0-9a-f-]+)\/images\/([0-9a-f-]+)$/i);
	if (publicImage && request.method === "GET") {
		const [, gigId, imageId] = publicImage;
		if (!uuidPattern.test(gigId) || !uuidPattern.test(imageId)) return json({ error: "Not found" }, 404);
		const image = await env.DB.prepare(`
      SELECT i.object_key FROM gig_images i JOIN gigs g ON g.id = i.gig_id
      JOIN provider_profiles pp ON pp.firebase_uid = g.provider_uid
      JOIN profiles p ON p.firebase_uid = g.provider_uid
      WHERE i.id = ? AND g.id = ? AND g.status = 'active' AND pp.provider_status = 'active' AND p.account_status = 'active'
    `).bind(imageId, gigId).first();
		if (!image) return json({ error: "Not found" }, 404);
		const object = await env.MEDIA.get(image.object_key);
		return object ? imageResponse(object) : json({ error: "Not found" }, 404);
	}
	if (path === "/v1/me/follows" && request.method === "GET") {
		const owner = needsAuth(user);
		return json({ following: (await env.DB.prepare(`SELECT pp.public_id,p.display_name,p.avatar_url,p.campus,p.state_name,
      (CASE WHEN p.show_online=1 AND p.last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 minutes') THEN 1 ELSE 0 END) AS online FROM provider_follows f
      JOIN provider_profiles pp ON pp.firebase_uid=f.provider_uid
      JOIN profiles p ON p.firebase_uid=f.provider_uid
      WHERE f.follower_uid=? AND pp.provider_status='active' AND p.account_status='active'
      ORDER BY f.created_at DESC LIMIT 100`).bind(owner.uid).all()).results || [] });
	}
	const followMatch = path.match(/^\/v1\/me\/follows\/([0-9a-f]{32})$/i);
	if (followMatch && (request.method === "PUT" || request.method === "DELETE")) {
		const owner = mustHaveVerifiedEmail(user);
		await context.rateLimit(env, owner.uid, "follows", 20);
		const target = await env.DB.prepare(`SELECT pp.firebase_uid FROM provider_profiles pp
      JOIN profiles p ON p.firebase_uid=pp.firebase_uid
      WHERE pp.public_id=? AND pp.provider_status='active' AND p.account_status='active'`).bind(followMatch[1]).first();
		if (!target) return json({ error: "Provider not found" }, 404);
		if (target.firebase_uid === owner.uid) throw new InputError("You cannot follow yourself");
		if (request.method === "PUT") await env.DB.prepare("INSERT OR IGNORE INTO provider_follows(follower_uid,provider_uid) VALUES (?,?)").bind(owner.uid, target.firebase_uid).run();
		else await env.DB.prepare("DELETE FROM provider_follows WHERE follower_uid=? AND provider_uid=?").bind(owner.uid, target.firebase_uid).run();
		const total = await env.DB.prepare("SELECT COUNT(*) AS count FROM provider_follows WHERE provider_uid=?").bind(target.firebase_uid).first();
		return json({
			following: request.method === "PUT",
			followerCount: total?.count || 0
		});
	}
	if (path === "/v1/me/presence" && request.method === "POST") {
		const owner = mustHaveVerifiedEmail(user);
		await context.rateLimit(env, owner.uid, "presence", 8);
		const body = await context.readJson(request);
		if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "visible") || typeof body.visible !== "boolean") throw new InputError("Choose whether to show your online status");
		const visible = body.visible;
		await env.DB.prepare(`UPDATE profiles SET show_online=?,last_seen_at=CASE WHEN ?=1 THEN
      strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END WHERE firebase_uid=?`).bind(Number(visible), Number(visible), owner.uid).run();
		return json({ visible });
	}
	if (path === "/v1/provider" && request.method === "GET") {
		const owner = needsAuth(user);
		const application = await env.DB.prepare("SELECT * FROM provider_applications WHERE firebase_uid = ?").bind(owner.uid).first();
		const verified = await env.DB.prepare("SELECT verified_at, provider_status FROM provider_profiles WHERE firebase_uid = ?").bind(owner.uid).first();
		return json({
			application: serializeApplication(application),
			verified: Boolean(verified && verified.provider_status === "active"),
			provider: verified
		});
	}
	if (path === "/v1/provider/evidence" && request.method === "POST") {
		const owner = mustHaveVerifiedEmail(user);
		await context.rateLimit(env, owner.uid, "evidence", 4);
		await context.rateLimit(env, owner.uid, "evidence-daily", 12);
		if ((await env.DB.prepare("SELECT status FROM provider_applications WHERE firebase_uid = ?").bind(owner.uid).first())?.status === "approved") throw new InputError("Your provider account is already approved");
		const image = await readImage(request);
		const key = `provider-evidence/${owner.uid}/${crypto.randomUUID()}.${image.ext}`;
		await env.MEDIA.put(key, image.bytes, {
			httpMetadata: { contentType: image.type },
			customMetadata: {
				ownerUid: owner.uid,
				privacy: "admin-only"
			}
		});
		return json({ evidenceKey: key }, 201);
	}
	if (path === "/v1/provider/application" && request.method === "POST") {
		const owner = mustHaveVerifiedEmail(user);
		await context.rateLimit(env, owner.uid, "provider-apply", 5);
		const value = parseProviderApplication(await context.readJson(request));
		if (value.locationKind === "campus") {
			const place = await env.DB.prepare("SELECT institution_id FROM profiles WHERE firebase_uid=?").bind(owner.uid).first();
			if (!place?.institution_id) throw new InputError("Choose your recognised institution in Profile → Campus & privacy first, or select City");
			value.locationName = (await findInstitution(env, place.institution_id)).name;
		}
		if (!value.evidenceKey.startsWith(`provider-evidence/${owner.uid}/`)) throw new InputError("Upload your own ID image first");
		const object = await env.MEDIA.head(value.evidenceKey);
		if (!object || object.customMetadata?.ownerUid !== owner.uid) throw new InputError("Uploaded ID image was not found");
		const existing = await env.DB.prepare("SELECT id,status FROM provider_applications WHERE firebase_uid = ?").bind(owner.uid).first();
		if (existing?.status === "approved" || existing?.status === "pending") throw new InputError("Your application has already been submitted");
		const fields = [
			JSON.stringify(value.categories),
			value.locationName,
			value.locationKind,
			value.bio,
			value.evidenceType,
			value.evidenceKey
		];
		if (existing) {
			if ((await env.DB.prepare(`
        UPDATE provider_applications SET skill_categories=?,location_name=?,location_kind=?,bio=?,evidence_type=?,evidence_key=?,
          status='pending',revision=revision+1,review_note='',reviewed_by_uid=NULL,reviewed_at=NULL,
          submitted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=? AND firebase_uid=? AND status IN ('rejected','changes_requested')
      `).bind(...fields, existing.id, owner.uid).run()).meta.changes !== 1) throw new InputError("Application status changed. Refresh and try again.");
		} else await env.DB.prepare(`
        INSERT INTO provider_applications (id,firebase_uid,skill_categories,location_name,location_kind,bio,evidence_type,evidence_key)
        VALUES (?,?,?,?,?,?,?,?)
      `).bind(crypto.randomUUID(), owner.uid, ...fields).run();
		return json({ message: "Application received. Admin review is pending." }, 201);
	}
	if (path === "/v1/provider/gigs" && request.method === "GET") {
		const owner = needsAuth(user);
		return json({ gigs: (await env.DB.prepare(`
      SELECT g.*, (SELECT COUNT(*) FROM gig_images WHERE gig_id=g.id) AS image_count,
      (SELECT id FROM gig_images WHERE gig_id=g.id ORDER BY created_at LIMIT 1) AS cover_image_id
      FROM gigs g WHERE provider_uid = ? ORDER BY created_at DESC LIMIT 100
    `).bind(owner.uid).all()).results || [] });
	}
	if (path === "/v1/provider/gigs" && request.method === "POST") {
		const owner = mustHaveVerifiedEmail(user);
		await context.rateLimit(env, owner.uid, "create-gig", 8);
		if (!await env.DB.prepare(`
      SELECT pp.firebase_uid FROM provider_profiles pp JOIN profiles p ON p.firebase_uid=pp.firebase_uid
      WHERE pp.firebase_uid=? AND pp.provider_status='active' AND p.account_status='active'
    `).bind(owner.uid).first()) return json({ error: "Your provider application must be approved before publishing" }, 403);
		const value = parseGig(await context.readJson(request));
		const home = await env.DB.prepare("SELECT state_name,institution_id FROM profiles WHERE firebase_uid=?").bind(owner.uid).first();
		if (!home?.state_name || value.state !== home.state_name) throw new InputError("Gig state must match your confirmed profile state");
		if (value.institutionId && value.institutionId !== home.institution_id) throw new InputError("Publish for your confirmed institution or choose state-wide service");
		if (value.institutionId) {
			if ((await findInstitution(env, value.institutionId)).state_name !== value.state) throw new InputError("This institution is not in the chosen state");
		}
		const id = crypto.randomUUID();
		await env.DB.prepare(`
      INSERT INTO gigs (id,provider_uid,title,description,category,price_kobo,delivery_days,location_type,location_name,payment_option,state_name,institution_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(id, owner.uid, value.title, value.description, value.category, value.priceKobo, value.deliveryDays, value.locationType, value.locationName, value.paymentOption, value.state, value.institutionId || null).run();
		return json({
			id,
			message: "Gig published. Bookings and payments are not active yet."
		}, 201);
	}
	const imagesMatch = path.match(/^\/v1\/provider\/gigs\/([0-9a-f-]+)\/images$/i);
	if (imagesMatch && request.method === "POST") {
		const owner = mustHaveVerifiedEmail(user);
		const gigId = imagesMatch[1];
		if (!uuidPattern.test(gigId)) return json({ error: "Not found" }, 404);
		await context.rateLimit(env, owner.uid, "gig-image", 10);
		const existing = await env.DB.prepare(`
      SELECT g.id,g.status,(SELECT COUNT(*) FROM gig_images WHERE gig_id=g.id) AS image_count
      FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid
      WHERE g.id=? AND g.provider_uid=? AND pp.provider_status='active'
    `).bind(gigId, owner.uid).first();
		if (!existing || existing.status === "removed") return json({ error: "Gig not found or not editable" }, 404);
		if (existing.image_count >= 4) throw new InputError("Maximum four images per gig");
		const image = await readImage(request);
		const imageId = crypto.randomUUID();
		const key = `gig-images/${gigId}/${imageId}.${image.ext}`;
		await env.MEDIA.put(key, image.bytes, { httpMetadata: { contentType: image.type } });
		try {
			if ((await env.DB.prepare(`
        INSERT INTO gig_images (id,gig_id,object_key,media_type)
        SELECT ?,g.id,?,? FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid
        WHERE g.id=? AND g.provider_uid=? AND g.status!='removed' AND pp.provider_status='active'
          AND (SELECT COUNT(*) FROM gig_images WHERE gig_id=g.id) < 4
      `).bind(imageId, key, image.type, gigId, owner.uid).run()).meta.changes !== 1) {
				await env.MEDIA.delete(key);
				return json({ error: "Gig unavailable or already has four images" }, 409);
			}
		} catch (error) {
			await env.MEDIA.delete(key);
			throw error;
		}
		return json({
			imageId,
			url: `/v1/public/gigs/${gigId}/images/${imageId}`
		}, 201);
	}
	if (path === "/v1/admin/providers" && request.method === "GET") {
		requireAdmin(context);
		const status = url.searchParams.get("status") || "pending";
		if (![
			"all",
			"pending",
			"approved",
			"rejected",
			"changes_requested"
		].includes(status)) throw new InputError("Invalid status filter");
		const query = `SELECT a.id,a.firebase_uid,a.skill_categories,a.location_name,a.location_kind,a.bio,a.evidence_type,a.status,
      a.revision,a.review_note,a.submitted_at,a.updated_at,p.display_name,p.email
      FROM provider_applications a JOIN profiles p ON p.firebase_uid=a.firebase_uid
      ${status === "all" ? "" : "WHERE a.status=?"} ORDER BY a.submitted_at DESC LIMIT 100`;
		return json({ applications: resultRows(status === "all" ? await env.DB.prepare(query).all() : await env.DB.prepare(query).bind(status).all()).map((row) => serializeApplication(row)) });
	}
	const evidenceMatch = path.match(/^\/v1\/admin\/providers\/([0-9a-f-]+)\/evidence$/i);
	if (evidenceMatch && request.method === "GET") {
		requireAdmin(context);
		const id = evidenceMatch[1];
		if (!uuidPattern.test(id)) return json({ error: "Not found" }, 404);
		const row = await env.DB.prepare("SELECT evidence_key FROM provider_applications WHERE id = ?").bind(id).first();
		if (!row) return json({ error: "Not found" }, 404);
		const object = await env.MEDIA.get(row.evidence_key);
		return object ? imageResponse(object) : json({ error: "Image unavailable" }, 404);
	}
	const reviewMatch = path.match(/^\/v1\/admin\/providers\/([0-9a-f-]+)\/review$/i);
	if (reviewMatch && request.method === "POST") {
		const admin = requireAdmin(context);
		const id = reviewMatch[1];
		if (!uuidPattern.test(id)) return json({ error: "Not found" }, 404);
		await context.rateLimit(env, admin.uid, "provider-review", 20);
		const value = parseReview(await context.readJson(request));
		const applicant = await env.DB.prepare("SELECT firebase_uid,status FROM provider_applications WHERE id=?").bind(id).first();
		if (!applicant) return json({ error: "Application not found" }, 404);
		if (applicant.firebase_uid === admin.uid) return json({ error: "Administrators cannot approve their own applications" }, 403);
		const statements = [env.DB.prepare(`
      UPDATE provider_applications SET status=?,review_note=?,reviewed_by_uid=?,
        reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND status='pending'
    `).bind(value.decision, value.note, admin.uid, id)];
		statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO provider_review_events (id,application_id,admin_uid,decision,note,revision)
      SELECT ?,a.id,?,?,?,a.revision FROM provider_applications a
      WHERE a.id=? AND a.status=? AND a.reviewed_by_uid=?
    `).bind(crypto.randomUUID(), admin.uid, value.decision, value.note, id, value.decision, admin.uid));
		if (value.decision === "approved") statements.push(env.DB.prepare(`
      INSERT INTO provider_profiles (firebase_uid,application_id,approved_by_uid,public_id)
      SELECT a.firebase_uid,a.id,?,lower(hex(randomblob(16))) FROM provider_applications a
      WHERE a.id=? AND a.status='approved' AND a.reviewed_by_uid=?
      ON CONFLICT(firebase_uid) DO NOTHING
    `).bind(admin.uid, id, admin.uid));
		if ((await env.DB.batch(statements))[0].meta.changes !== 1) return json({ error: "Application was already reviewed. Refresh the list." }, 409);
		return json({ message: `Application ${value.decision.replace("_", " ")}` });
	}
	if (path === "/v1/admin/gigs" && request.method === "GET") {
		requireAdmin(context);
		return json({ gigs: (await env.DB.prepare(`
      SELECT ${publicGigFields}, g.moderation_note, p.display_name AS provider_name, p.email AS provider_email,
        (SELECT COUNT(*) FROM gig_images WHERE gig_id=g.id) AS image_count,
        (SELECT id FROM gig_images WHERE gig_id=g.id ORDER BY created_at LIMIT 1) AS cover_image_id
      FROM gigs g JOIN profiles p ON p.firebase_uid=g.provider_uid
      ORDER BY g.created_at DESC LIMIT 100
    `).all()).results || [] });
	}
	const moderateMatch = path.match(/^\/v1\/admin\/gigs\/([0-9a-f-]+)\/moderate$/i);
	if (moderateMatch && request.method === "POST") {
		const admin = requireAdmin(context);
		const id = moderateMatch[1];
		if (!uuidPattern.test(id)) return json({ error: "Not found" }, 404);
		await context.rateLimit(env, admin.uid, "gig-moderate", 20);
		const { decision, note } = parseModeration(await context.readJson(request));
		const status = decision === "removed" ? "removed" : "active";
		if ((await env.DB.prepare(`
      UPDATE gigs SET status=?,moderation_note=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND status!=?
    `).bind(status, note, id, status).run()).meta.changes !== 1) return json({ error: "Gig not found or already in that state" }, 409);
		await env.DB.prepare("INSERT INTO gig_moderation_events (id,gig_id,admin_uid,decision,note) VALUES (?,?,?,?,?)").bind(crypto.randomUUID(), id, admin.uid, decision, note).run();
		return json({
			status,
			message: decision === "removed" ? "Gig removed from public listings" : "Gig restored"
		});
	}
	return null;
}
// src/bookingValidation.ts
var uuid$1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var asObject$1 = (input) => {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Invalid booking information");
	return input;
};
var expectFields = (input, keys) => {
	if (Object.keys(input).some((key) => !keys.includes(key))) throw new InputError("Unknown booking field");
};
function parseBookingRequest(input) {
	const value = asObject$1(input);
	expectFields(value, [
		"gigId",
		"requestId",
		"brief"
	]);
	if (typeof value.gigId !== "string" || !uuid$1.test(value.gigId)) throw new InputError("Invalid gig");
	if (typeof value.requestId !== "string" || !uuid$1.test(value.requestId)) throw new InputError("Invalid request ID");
	if (typeof value.brief !== "string") throw new InputError("Tell the provider what you need");
	const brief = value.brief.trim();
	if (brief.length < 20 || brief.length > 2e3) throw new InputError("Write 20–2000 characters about your request");
	return {
		gigId: value.gigId,
		requestId: value.requestId,
		brief
	};
}
function parseBookingDecision(input) {
	const value = asObject$1(input);
	expectFields(value, ["decision"]);
	if (value.decision !== "accept" && value.decision !== "decline") throw new InputError("Choose accept or decline");
	return value.decision;
}
function parseBookingRole(url) {
	if ([...url.searchParams.keys()].some((key) => key !== "role") || url.searchParams.getAll("role").length > 1) throw new InputError("Invalid booking filter");
	const role = url.searchParams.get("role") || "buyer";
	if (role !== "buyer" && role !== "provider") throw new InputError("Invalid booking filter");
	return role;
}
function bookingUuid(input) {
	return uuid$1.test(input);
}
function parseBookingProgress(input) {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Invalid booking progress");
	const item = input;
	if (Object.keys(item).some((key) => !["action", "note"].includes(key)) || ![
		"start",
		"submit",
		"confirm"
	].includes(String(item.action))) throw new InputError("Invalid booking action");
	const action = item.action;
	if (action !== "submit" && "note" in item) throw new InputError("A note is only used when submitting work");
	const note = action === "submit" && typeof item.note === "string" ? item.note.trim() : "";
	if (action === "submit" && (note.length < 10 || note.length > 500)) throw new InputError("Add a delivery note (10–500 characters)");
	return {
		action,
		note
	};
}
function parseBookingReview(input) {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Invalid review");
	const item = input;
	if (Object.keys(item).some((key) => !["rating", "comment"].includes(key)) || !Number.isInteger(item.rating) || Number(item.rating) < 1 || Number(item.rating) > 5 || item.comment !== void 0 && typeof item.comment !== "string") throw new InputError("Choose a rating from 1 to 5");
	const comment = typeof item.comment === "string" ? item.comment.trim() : "";
	if (comment.length > 500) throw new InputError("Review must be 500 characters or fewer");
	return {
		rating: Number(item.rating),
		comment
	};
}
// src/bookings.ts
var bookable = `g.status='active' AND pp.provider_status='active' AND p.account_status='active'
  AND NOT EXISTS(SELECT 1 FROM provider_availability a WHERE a.provider_uid=g.provider_uid AND a.accepting_bookings=0)`;
async function bookings(context) {
	const { request, url, env, user, json } = context;
	const path = url.pathname;
	if (path === "/v1/provider/availability" && (request.method === "GET" || request.method === "PUT")) {
		if (!await env.DB.prepare(`SELECT pp.firebase_uid FROM provider_profiles pp
      JOIN profiles p ON p.firebase_uid=pp.firebase_uid
      WHERE pp.firebase_uid=? AND pp.provider_status='active' AND p.account_status='active'`).bind(user.uid).first()) return json({ error: "Only active verified providers can manage availability" }, 403);
		if (request.method === "PUT") {
			if (!user.emailVerified) return json({ error: "Verify your email first" }, 403);
			await context.rateLimit(env, user.uid, "provider-availability", 10);
			const body = await context.readJson(request);
			if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "acceptingBookings") || typeof body.acceptingBookings !== "boolean") throw new InputError("Choose whether to accept new bookings");
			const accepting = Number(body.acceptingBookings);
			await env.DB.prepare(`INSERT INTO provider_availability(provider_uid,accepting_bookings) VALUES (?,?)
        ON CONFLICT(provider_uid) DO UPDATE SET accepting_bookings=excluded.accepting_bookings,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(user.uid, accepting).run();
		}
		const [availability, active] = await Promise.all([env.DB.prepare("SELECT accepting_bookings FROM provider_availability WHERE provider_uid=?").bind(user.uid).first(), env.DB.prepare("SELECT COUNT(*) AS total FROM service_bookings WHERE provider_uid=? AND status='accepted' AND progress_status!='completed'").bind(user.uid).first()]);
		return json({
			acceptingBookings: (availability?.accepting_bookings ?? 1) === 1,
			activeBookings: active?.total || 0
		});
	}
	if (path === "/v1/bookings" && request.method === "GET") {
		const role = parseBookingRole(url);
		const field = role === "buyer" ? "b.buyer_uid" : "b.provider_uid";
		return json({
			bookings: (await env.DB.prepare(`
      SELECT b.id,b.gig_id,b.service_title,b.service_category,b.price_kobo,b.delivery_days,
        b.brief,b.status,b.progress_status,b.started_at,b.submitted_at,b.completed_at,
        b.requested_at,b.responded_at,b.updated_at,
        buyer.display_name AS buyer_name, provider.display_name AS provider_name,
        EXISTS(SELECT 1 FROM service_reviews r WHERE r.booking_id=b.id) AS reviewed,
        (SELECT id FROM gig_images WHERE gig_id=b.gig_id ORDER BY created_at LIMIT 1) AS cover_image_id
      FROM service_bookings b JOIN profiles buyer ON buyer.firebase_uid=b.buyer_uid
      JOIN profiles provider ON provider.firebase_uid=b.provider_uid
      WHERE ${field}=? ORDER BY b.requested_at DESC,b.id DESC LIMIT 100
    `).bind(user.uid).all()).results || [],
			role,
			paymentsEnabled: false
		});
	}
	if (path === "/v1/bookings" && request.method === "POST") {
		if (!user.emailVerified) return json({ error: "Verify your email before requesting a service" }, 403);
		await context.rateLimit(env, user.uid, "booking-request", 5);
		await context.rateLimit(env, user.uid, "booking-request-daily", 20);
		const value = parseBookingRequest(await context.readJson(request));
		const previous = await env.DB.prepare("SELECT id,gig_id,status FROM service_bookings WHERE buyer_uid=? AND request_id=?").bind(user.uid, value.requestId).first();
		if (previous) return previous.gig_id === value.gigId ? json({
			booking: previous,
			reused: true,
			paymentsEnabled: false
		}) : json({ error: "Request ID already used" }, 409);
		const id = crypto.randomUUID();
		if ((await env.DB.prepare(`
      INSERT OR IGNORE INTO service_bookings
        (id,buyer_uid,provider_uid,gig_id,request_id,service_title,service_category,
          price_kobo,delivery_days,brief,last_actor_uid)
      SELECT ?, ?, g.provider_uid, g.id, ?, g.title, g.category, g.price_kobo, g.delivery_days, ?, ?
      FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid
      JOIN profiles p ON p.firebase_uid=g.provider_uid
      WHERE g.id=? AND g.provider_uid<>? AND ${bookable}
    `).bind(id, user.uid, value.requestId, value.brief, user.uid, value.gigId, user.uid).run()).meta.changes !== 1) {
			const repeated = await env.DB.prepare("SELECT id,gig_id,status FROM service_bookings WHERE buyer_uid=? AND request_id=?").bind(user.uid, value.requestId).first();
			return repeated?.gig_id === value.gigId ? json({
				booking: repeated,
				reused: true,
				paymentsEnabled: false
			}) : json({ error: "Gig unavailable or request could not be created" }, 409);
		}
		return json({
			booking: {
				id,
				gig_id: value.gigId,
				status: "requested"
			},
			reused: false,
			paymentsEnabled: false
		}, 201);
	}
	const detail = path.match(/^\/v1\/bookings\/([0-9a-f-]+)$/i);
	if (detail && request.method === "GET") {
		if (!bookingUuid(detail[1])) return json({ error: "Not found" }, 404);
		const booking = await env.DB.prepare("SELECT * FROM service_bookings WHERE id=? AND (buyer_uid=? OR provider_uid=?)").bind(detail[1], user.uid, user.uid).first();
		if (!booking) return json({ error: "Booking not found" }, 404);
		const events = await env.DB.prepare("SELECT from_status,to_status,created_at FROM booking_events WHERE booking_id=? ORDER BY id ASC LIMIT 30").bind(detail[1]).all();
		const review = await env.DB.prepare("SELECT rating,comment,created_at FROM service_reviews WHERE booking_id=?").bind(detail[1]).first();
		const { buyer_uid: _buyerUid, provider_uid: _providerUid, request_id: _requestId, last_actor_uid: _lastActor, ...safe } = booking;
		return json({
			booking: safe,
			events: events.results || [],
			review: review || null,
			viewerRole: user.uid === booking.buyer_uid ? "buyer" : "provider",
			paymentsEnabled: false
		});
	}
	const progress = path.match(/^\/v1\/bookings\/([0-9a-f-]+)\/progress$/i);
	if (progress && request.method === "POST") {
		if (!bookingUuid(progress[1])) return json({ error: "Not found" }, 404);
		if (!user.emailVerified) return json({ error: "Verify your email before updating work" }, 403);
		await context.rateLimit(env, user.uid, "booking-progress", 20);
		const { action, note } = parseBookingProgress(await context.readJson(request));
		const previous = action === "start" ? "not_started" : action === "submit" ? "in_progress" : "submitted";
		const next = action === "start" ? "in_progress" : action === "submit" ? "submitted" : "completed";
		const owner = action === "confirm" ? "buyer_uid" : "provider_uid";
		if ((await env.DB.prepare(`UPDATE service_bookings
      SET progress_status=?,last_actor_uid=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        started_at=CASE WHEN ?='start' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE started_at END,
        submitted_at=CASE WHEN ?='submit' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE submitted_at END,
        completion_note=CASE WHEN ?='submit' THEN ? ELSE completion_note END,
        completed_at=CASE WHEN ?='confirm' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE completed_at END
      WHERE id=? AND ${owner}=? AND status='accepted' AND progress_status=?`).bind(next, user.uid, action, action, action, note, action, progress[1], user.uid, previous).run()).meta.changes === 1) return json({
			booking: {
				id: progress[1],
				progress_status: next
			},
			reused: false,
			paymentsEnabled: false
		});
		const current = await env.DB.prepare(`SELECT progress_status,status FROM service_bookings WHERE id=? AND ${owner}=?`).bind(progress[1], user.uid).first();
		if (!current) return json({ error: "Booking not found" }, 404);
		return current.status === "accepted" && current.progress_status === next ? json({
			booking: {
				id: progress[1],
				progress_status: next
			},
			reused: true,
			paymentsEnabled: false
		}) : json({ error: "Booking is not ready for this step. Refresh and try again." }, 409);
	}
	const review = path.match(/^\/v1\/bookings\/([0-9a-f-]+)\/review$/i);
	if (review && request.method === "POST") {
		if (!bookingUuid(review[1])) return json({ error: "Not found" }, 404);
		if (!user.emailVerified) return json({ error: "Verify your email before reviewing" }, 403);
		await context.rateLimit(env, user.uid, "booking-review", 8);
		const { rating, comment } = parseBookingReview(await context.readJson(request));
		if ((await env.DB.prepare(`INSERT OR IGNORE INTO service_reviews(booking_id,buyer_uid,provider_uid,rating,comment)
      SELECT b.id,b.buyer_uid,b.provider_uid,?,? FROM service_bookings b
      WHERE b.id=? AND b.buyer_uid=? AND b.status='accepted' AND b.progress_status='completed'`).bind(rating, comment, review[1], user.uid).run()).meta.changes === 1) return json({
			review: {
				rating,
				comment
			},
			created: true
		}, 201);
		const own = await env.DB.prepare("SELECT progress_status FROM service_bookings WHERE id=? AND buyer_uid=?").bind(review[1], user.uid).first();
		if (!own) return json({ error: "Booking not found" }, 404);
		return json({ error: own.progress_status !== "completed" ? "Confirm delivery before reviewing" : "This booking has already been reviewed" }, 409);
	}
	const decision = path.match(/^\/v1\/bookings\/([0-9a-f-]+)\/decision$/i);
	if (decision && request.method === "POST") {
		if (!bookingUuid(decision[1])) return json({ error: "Not found" }, 404);
		if (!user.emailVerified) return json({ error: "Verify your email before responding" }, 403);
		await context.rateLimit(env, user.uid, "booking-decision", 15);
		const status = parseBookingDecision(await context.readJson(request)) === "accept" ? "accepted" : "declined";
		return (await env.DB.prepare(`
      UPDATE service_bookings SET status=?,last_actor_uid=?,responded_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND provider_uid=? AND status='requested'
        AND EXISTS(SELECT 1 FROM provider_profiles pp JOIN profiles p ON p.firebase_uid=pp.firebase_uid
          WHERE pp.firebase_uid=? AND pp.provider_status='active' AND p.account_status='active')
    `).bind(status, user.uid, decision[1], user.uid, user.uid).run()).meta.changes === 1 ? json({
			booking: {
				id: decision[1],
				status
			},
			paymentsEnabled: false
		}) : json({ error: "This request cannot be changed or is not assigned to you" }, 409);
	}
	const cancellation = path.match(/^\/v1\/bookings\/([0-9a-f-]+)\/cancel$/i);
	if (cancellation && request.method === "POST") {
		if (!bookingUuid(cancellation[1])) return json({ error: "Not found" }, 404);
		await context.rateLimit(env, user.uid, "booking-cancel", 12);
		return (await env.DB.prepare(`
      UPDATE service_bookings SET status='cancelled',last_actor_uid=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id=? AND buyer_uid=? AND status IN ('requested','accepted') AND progress_status IN ('not_started','in_progress')
    `).bind(user.uid, cancellation[1], user.uid).run()).meta.changes === 1 ? json({
			booking: {
				id: cancellation[1],
				status: "cancelled"
			},
			paymentsEnabled: false
		}) : json({ error: "This request is already closed or is not yours" }, 409);
	}
	return null;
}
async function adminBookings(env, json) {
	const result = await env.DB.prepare(`
    SELECT b.id,b.service_title,b.price_kobo,b.status,b.progress_status,b.brief,b.requested_at,b.responded_at,
      buyer.display_name AS buyer_name,buyer.email AS buyer_email,
      provider.display_name AS provider_name
    FROM service_bookings b JOIN profiles buyer ON buyer.firebase_uid=b.buyer_uid
    JOIN profiles provider ON provider.firebase_uid=b.provider_uid
    ORDER BY b.requested_at DESC,b.id DESC LIMIT 100
  `).all();
	const counts = await env.DB.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='requested' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END) AS declined,
      SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled
      ,SUM(CASE WHEN progress_status='completed' THEN 1 ELSE 0 END) AS completed
    FROM service_bookings
  `).first();
	return json({
		bookings: result.results || [],
		counts,
		paymentsEnabled: false
	});
}
// src/onboardingValidation.ts
var interestOptions = skillCategories;
var kinds = [
	"buyer",
	"provider",
	"both"
];
var ages = [
	"under_18",
	"18_24",
	"25_34",
	"35_44",
	"45_plus"
];
var statuses = ["student", "non_student"];
function parseOnboarding(body) {
	if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Invalid setup information");
	const record = body;
	const fields = [
		"userKind",
		"ageRange",
		"studentStatus",
		"interests",
		"school",
		"city",
		"displayName",
		"state",
		"institutionId",
		"faculty",
		"department"
	];
	if (Object.keys(record).some((key) => !fields.includes(key))) throw new InputError("Unknown setup field");
	if (!kinds.includes(record.userKind)) throw new InputError("Choose how you want to use CampusGigs");
	if (!ages.includes(record.ageRange)) throw new InputError("Select your age group");
	if (!statuses.includes(record.studentStatus)) throw new InputError("Select your school status");
	if (!Array.isArray(record.interests) || record.interests.length < 1 || record.interests.length > 5 || new Set(record.interests).size !== record.interests.length || record.interests.some((value) => !interestOptions.includes(value))) throw new InputError("Choose between one and five interests");
	function clean(name, max, min) {
		const input = record[name];
		if (typeof input !== "string") throw new InputError(`${name} is required`);
		const value = input.trim();
		if (value.length < min || value.length > max || /[\x00-\x1f]/.test(value)) throw new InputError(`${name} must be ${min}–${max} characters`);
		return value;
	}
	const studentStatus = record.studentStatus;
	const school = clean("school", 100, studentStatus === "student" ? 2 : 0);
	const state = clean("state", 40, 2);
	if (!nigeriaStates.includes(state)) throw new InputError("Choose your Nigerian state");
	const institutionId = clean("institutionId", 20, studentStatus === "student" ? 20 : 0);
	if (institutionId && !institutionIdPattern.test(institutionId)) throw new InputError("Choose a recognised school from the list");
	const academics = parseAcademics(record.faculty ?? "", record.department ?? "");
	if (studentStatus === "non_student" && (academics.faculty || academics.department)) throw new InputError("Academic details are for students");
	return {
		userKind: record.userKind,
		ageRange: record.ageRange,
		studentStatus,
		interests: record.interests,
		school,
		state,
		institutionId,
		...academics,
		city: clean("city", 100, 2),
		displayName: clean("displayName", 60, 2)
	};
}
// src/notifications.ts
async function notifications({ request, url, env, user, json, rateLimit }) {
	const path = url.pathname;
	if (path === "/v1/me/notifications" && request.method === "GET") {
		const keys = [...url.searchParams.keys()];
		const filter = url.searchParams.get("filter") || "all";
		if (keys.some((key) => key !== "filter") || keys.length > 1 || ![
			"all",
			"unread",
			"archived"
		].includes(filter)) return json({ error: "Unsupported notification filter" }, 400);
		const scope = filter === "archived" ? "archived_at IS NOT NULL" : filter === "unread" ? "archived_at IS NULL AND is_read=0" : "archived_at IS NULL";
		const [rows, total, archived] = await Promise.all([
			env.DB.prepare(`SELECT id,kind,title,body,target_path,is_read,created_at,archived_at FROM user_notifications
        WHERE recipient_uid=? AND ${scope} ORDER BY created_at DESC,id DESC LIMIT 50`).bind(user.uid).all(),
			env.DB.prepare("SELECT COUNT(*) AS count FROM user_notifications WHERE recipient_uid=? AND archived_at IS NULL AND is_read=0").bind(user.uid).first(),
			env.DB.prepare("SELECT COUNT(*) AS count FROM user_notifications WHERE recipient_uid=? AND archived_at IS NOT NULL").bind(user.uid).first()
		]);
		return json({
			notifications: rows.results || [],
			unreadCount: total?.count || 0,
			archivedCount: archived?.count || 0
		});
	}
	if (path === "/v1/me/notifications/read-all" && request.method === "POST") {
		await rateLimit(env, user.uid, "notification-read", 12);
		return json({
			read: true,
			changed: (await env.DB.prepare("UPDATE user_notifications SET is_read=1 WHERE recipient_uid=? AND is_read=0 AND archived_at IS NULL").bind(user.uid).run()).meta.changes
		});
	}
	const match = path.match(/^\/v1\/me\/notifications\/([0-9a-f]{32})\/(read|archive|restore)$/i);
	if (match && request.method === "POST") {
		await rateLimit(env, user.uid, "notification-read", 12);
		const action = match[2].toLowerCase();
		const existing = await env.DB.prepare("SELECT id,archived_at FROM user_notifications WHERE id=? AND recipient_uid=?").bind(match[1], user.uid).first();
		if (!existing) return json({ error: "Notification not found" }, 404);
		if (action === "read") {
			if (existing.archived_at) return json({ error: "Restore notification before opening" }, 409);
			await env.DB.prepare("UPDATE user_notifications SET is_read=1 WHERE id=? AND recipient_uid=?").bind(match[1], user.uid).run();
			return json({ read: true });
		}
		if (action === "archive" && !existing.archived_at) await env.DB.prepare("UPDATE user_notifications SET archived_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND recipient_uid=?").bind(match[1], user.uid).run();
		if (action === "restore" && existing.archived_at) await env.DB.prepare("UPDATE user_notifications SET archived_at=NULL WHERE id=? AND recipient_uid=?").bind(match[1], user.uid).run();
		return json({ archived: action === "archive" });
	}
	return null;
}
// src/community.ts
function verified(user) {
	if (!user) throw new InputError("Sign in to continue");
	if (!user.emailVerified) throw new InputError("Verify your email first");
	return user;
}
function pattern(query) {
	return query ? `%${query.trim().split(/\s+/).map((word) => likeTerm(word).slice(1, -1)).join("%")}%` : "%";
}
function relevance(person, q) {
	const term = q.trim().replace(/^@/, "").toLowerCase();
	const handle = String(person.cg_username || "").toLowerCase();
	const name = String(person.display_name || "").toLowerCase();
	return (term ? handle === term ? 100 : handle.startsWith(term) ? 85 : name === term ? 80 : name.startsWith(term) ? 70 : handle.includes(term) ? 60 : name.includes(term) ? 50 : 10 : 0) + Number(Boolean(person.online)) * 4 + Number(person.kind === "provider") * 2 + Math.min(Number(person.gig_count || 0), 3) + Math.min(Number(person.follower_count || 0), 10) * .1;
}
async function community(context) {
	const { request, url, env, json, user } = context;
	const path = url.pathname;
	if (path === "/v1/public/people" && request.method === "GET") {
		const filters = parseScope(url.searchParams, [
			"q",
			"state",
			"institutionId",
			"limit"
		]);
		if (filters.institutionId) {
			const school = await findInstitution(env, filters.institutionId);
			if (filters.state && school.state_name !== filters.state) throw new InputError("Institution is outside the selected state");
		}
		const term = filters.q.replace(/^@/, "");
		const q = pattern(term);
		const prefix = likeTerm(term).slice(1);
		const [providers, members] = await Promise.all([env.DB.prepare(`SELECT pp.public_id,'provider' AS kind,p.display_name,p.cg_username,p.avatar_url,p.bio,p.campus,p.city,p.state_name,p.institution_id,
        pp.verified_at,${onlineExpression} AS online,
        (SELECT COUNT(*) FROM provider_follows f WHERE f.provider_uid=p.firebase_uid) AS follower_count,
        (SELECT COUNT(*) FROM gigs g WHERE g.provider_uid=p.firebase_uid AND g.status='active') AS gig_count
        FROM provider_profiles pp JOIN profiles p ON p.firebase_uid=pp.firebase_uid
        WHERE pp.provider_status='active' AND pp.public_id IS NOT NULL AND p.account_status='active'
          AND p.directory_preference!='private'
          AND (?='' OR p.state_name=?) AND (?='' OR p.institution_id=?)
          AND (?='' OR p.display_name LIKE ? ESCAPE '\\' OR p.cg_username LIKE ? ESCAPE '\\' OR p.campus LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\'
            OR EXISTS(SELECT 1 FROM provider_applications a WHERE a.firebase_uid=p.firebase_uid AND a.skill_categories LIKE ? ESCAPE '\\')
            OR EXISTS(SELECT 1 FROM gigs g WHERE g.provider_uid=p.firebase_uid AND g.status='active' AND (g.title LIKE ? ESCAPE '\\' OR g.category LIKE ? ESCAPE '\\')))
        ORDER BY CASE WHEN lower(p.cg_username)=lower(?) THEN 0 WHEN p.cg_username LIKE ? ESCAPE '\\' THEN 1
          WHEN lower(p.display_name)=lower(?) THEN 2 WHEN p.display_name LIKE ? ESCAPE '\\' THEN 3 ELSE 4 END,
          online DESC,pp.verified_at DESC LIMIT ?`).bind(filters.state, filters.state, filters.institutionId, filters.institutionId, filters.q, q, q, q, q, q, q, q, term, prefix, term, prefix, filters.limit).all(), env.DB.prepare(`SELECT p.member_public_id AS public_id,'member' AS kind,p.display_name,p.cg_username,p.avatar_url,p.bio,p.campus,p.city,p.state_name,p.institution_id,
        '' AS verified_at,${onlineExpression} AS online,
        (SELECT COUNT(*) FROM member_follows f WHERE f.member_uid=p.firebase_uid) AS follower_count,
        0 AS gig_count
        FROM profiles p
        WHERE p.account_status='active' AND p.onboarding_completed=1 AND p.directory_preference='public' AND p.member_public_id IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM provider_profiles pp WHERE pp.firebase_uid=p.firebase_uid AND pp.provider_status='active')
          AND (?='' OR p.state_name=?) AND (?='' OR p.institution_id=?)
          AND (?='' OR p.display_name LIKE ? ESCAPE '\\' OR p.cg_username LIKE ? ESCAPE '\\' OR p.campus LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\')
        ORDER BY CASE WHEN lower(p.cg_username)=lower(?) THEN 0 WHEN p.cg_username LIKE ? ESCAPE '\\' THEN 1
          WHEN lower(p.display_name)=lower(?) THEN 2 WHEN p.display_name LIKE ? ESCAPE '\\' THEN 3 ELSE 4 END,
          online DESC,p.created_at DESC LIMIT ?`).bind(filters.state, filters.state, filters.institutionId, filters.institutionId, filters.q, q, q, q, q, term, prefix, term, prefix, filters.limit).all()]);
		const people = [...providers.results || [], ...members.results || []];
		people.sort((a, b) => relevance(b, term) - relevance(a, term) || String(a.public_id).localeCompare(String(b.public_id)));
		return json({ people: people.slice(0, filters.limit) });
	}
	const publicPerson = path.match(/^\/v1\/public\/people\/([0-9a-f]{32})$/i);
	if (publicPerson && request.method === "GET") {
		if (!publicProviderIdPattern.test(publicPerson[1])) return json({ error: "Not found" }, 404);
		if (await env.DB.prepare(`SELECT pp.public_id FROM provider_profiles pp
      JOIN profiles p ON p.firebase_uid=pp.firebase_uid WHERE pp.public_id=?
      AND pp.provider_status='active' AND p.account_status='active'`).bind(publicPerson[1]).first()) {
			const delegateUrl = new URL(`/v1/public/providers/${publicPerson[1]}`, url);
			const response = await phaseB({
				...context,
				url: delegateUrl
			});
			if (!response) return json({ error: "Not found" }, 404);
			if (!response.ok) return response;
			const result = await response.json();
			return json({
				person: {
					...result.provider,
					kind: "provider"
				},
				gigs: result.gigs
			});
		}
		const person = await env.DB.prepare(`SELECT p.member_public_id AS public_id,'member' AS kind,p.display_name,p.cg_username,p.avatar_url,p.bio,
      p.campus,p.city,p.state_name,p.institution_id,'' AS verified_at,${onlineExpression} AS online,
      (SELECT COUNT(*) FROM member_follows f WHERE f.member_uid=p.firebase_uid) AS follower_count
      FROM profiles p WHERE p.member_public_id=? AND p.directory_preference='public'
        AND p.onboarding_completed=1 AND p.account_status='active'`).bind(publicPerson[1]).first();
		return person ? json({
			person,
			gigs: []
		}) : json({ error: "Profile not found" }, 404);
	}
	if (path === "/v1/me/directory" && request.method === "PATCH") {
		const owner = verified(user);
		await context.rateLimit(env, owner.uid, "directory", 6);
		const body = await context.readJson(request);
		if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "visible") || typeof body.visible !== "boolean") throw new InputError("Choose whether your profile appears in Find Folks");
		const visible = body.visible;
		if (visible) {
			const current = await env.DB.prepare("SELECT state_name FROM profiles WHERE firebase_uid=?").bind(owner.uid).first();
			if (!current || !nigeriaStates.includes(current.state_name)) throw new InputError("Save your Nigerian state under Campus & privacy first");
		}
		const publicId = crypto.randomUUID().replaceAll("-", "");
		await env.DB.prepare(`UPDATE profiles SET directory_preference=?,member_public_id=COALESCE(member_public_id,?),
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE firebase_uid=? AND account_status='active'`).bind(visible ? "public" : "private", visible ? publicId : null, owner.uid).run();
		return json({ visible });
	}
	if (path === "/v1/me/community-follows" && request.method === "GET") {
		const owner = verified(user);
		const [providerRows, memberRows] = await Promise.all([env.DB.prepare(`SELECT pp.public_id,'provider' AS kind,p.display_name,p.cg_username,p.avatar_url,p.campus,p.state_name,
        ${onlineExpression} AS online,f.created_at FROM provider_follows f
        JOIN provider_profiles pp ON pp.firebase_uid=f.provider_uid JOIN profiles p ON p.firebase_uid=f.provider_uid
        WHERE f.follower_uid=? AND pp.provider_status='active' AND p.account_status='active'`).bind(owner.uid).all(), env.DB.prepare(`SELECT p.member_public_id AS public_id,'member' AS kind,p.display_name,p.cg_username,p.avatar_url,p.campus,p.state_name,
        ${onlineExpression} AS online,f.created_at FROM member_follows f JOIN profiles p ON p.firebase_uid=f.member_uid
        WHERE f.follower_uid=? AND p.member_public_id IS NOT NULL AND p.directory_preference='public' AND p.account_status='active'`).bind(owner.uid).all()]);
		const rows = [...providerRows.results || [], ...memberRows.results || []];
		rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
		return json({ following: rows.slice(0, 100).map(({ created_at: _hidden, ...row }) => row) });
	}
	const follow = path.match(/^\/v1\/me\/member-follows\/([0-9a-f]{32})$/i);
	if (follow && (request.method === "PUT" || request.method === "DELETE")) {
		const owner = verified(user);
		await context.rateLimit(env, owner.uid, "member-follows", 20);
		const target = await env.DB.prepare(`SELECT firebase_uid FROM profiles WHERE member_public_id=?
      AND directory_preference='public' AND onboarding_completed=1 AND account_status='active'`).bind(follow[1]).first();
		if (!target) return json({ error: "Member is not discoverable" }, 404);
		if (target.firebase_uid === owner.uid) throw new InputError("You cannot follow yourself");
		if (request.method === "PUT") await env.DB.prepare("INSERT OR IGNORE INTO member_follows(follower_uid,member_uid) VALUES (?,?)").bind(owner.uid, target.firebase_uid).run();
		else await env.DB.prepare("DELETE FROM member_follows WHERE follower_uid=? AND member_uid=?").bind(owner.uid, target.firebase_uid).run();
		const total = await env.DB.prepare("SELECT COUNT(*) AS count FROM member_follows WHERE member_uid=?").bind(target.firebase_uid).first();
		return json({
			following: request.method === "PUT",
			followerCount: total?.count || 0
		});
	}
	return null;
}
// src/searchAccount.ts
var usernameFormat = /^[a-z][a-z0-9_]{2,23}$/;
var reserved = /* @__PURE__ */ new Set([
	"admin",
	"administrator",
	"support",
	"help",
	"official",
	"campusgigs",
	"campus_gigs",
	"cgigs",
	"moderator",
	"system",
	"security",
	"billing",
	"verified",
	"staff"
]);
function parseUsername(input) {
	if (typeof input !== "string") throw new InputError("Enter a C-Gigs username");
	const name = input.trim().replace(/^@/, "").toLowerCase();
	if (!usernameFormat.test(name) || reserved.has(name) || name.includes("__")) throw new InputError("Use 3–24 letters, numbers or underscores, starting with a letter");
	return name;
}
function parseSearchEntry(input) {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Invalid search");
	const value = input;
	if (Object.keys(value).some((key) => ![
		"kind",
		"query",
		"state",
		"institutionId",
		"category",
		"location"
	].includes(key))) throw new InputError("Unknown search field");
	if (value.kind !== "gigs" && value.kind !== "people") throw new InputError("Invalid search type");
	const read = (key, max) => {
		const text = value[key] ?? "";
		if (typeof text !== "string" || text.length > max) throw new InputError(`Invalid ${key}`);
		return text.trim().replace(/\s+/gu, " ");
	};
	const query = read("query", 80);
	const state = read("state", 40);
	const institutionId = read("institutionId", 32);
	const category = read("category", 60);
	const location = read("location", 100);
	if (!query && !category && !location) throw new InputError("Search for a name or service before saving");
	if (query.length > 80 || !nigeriaStates.includes(state) && state) throw new InputError("Choose a valid search and state");
	if (value.kind === "people" && (category || location)) throw new InputError("Invalid people search filter");
	if (category && !skillCategories.includes(category)) throw new InputError("Choose a recognised skill");
	return {
		kind: value.kind,
		query,
		state,
		institutionId,
		category,
		location
	};
}
async function searchAccount(context) {
	const { request, url, env, user, json } = context;
	const path = url.pathname;
	if (path !== "/v1/me/username" && path !== "/v1/me/search-history" && !/^\/v1\/me\/search-history\/[0-9a-f-]{36}$/i.test(path)) return null;
	if (!user.emailVerified) return json({ error: "Verify your email first" }, 403);
	if (path === "/v1/me/username" && request.method === "PATCH") {
		await context.rateLimit(env, user.uid, "username", 6);
		const input = await context.readJson(request);
		if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "username")) throw new InputError("Enter your C-Gigs username");
		const username = parseUsername(input.username);
		if ((await env.DB.prepare("SELECT cg_username FROM profiles WHERE firebase_uid=?").bind(user.uid).first())?.cg_username === username) return json({ username });
		if (await env.DB.prepare("SELECT firebase_uid FROM profiles WHERE cg_username=? COLLATE NOCASE").bind(username).first()) return json({ error: "That username is taken. Try another one." }, 409);
		try {
			await env.DB.prepare(`UPDATE profiles SET cg_username=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE firebase_uid=?`).bind(username, user.uid).run();
		} catch (error) {
			if (String(error).includes("UNIQUE")) return json({ error: "That username is taken. Try another one." }, 409);
			throw error;
		}
		return json({ username });
	}
	if (path === "/v1/me/search-history" && request.method === "GET") return json({ history: (await env.DB.prepare(`SELECT id,kind,query,state_name AS state,institution_id AS institutionId,
      category,location_name AS location,last_used_at AS lastUsedAt FROM member_search_history
      WHERE firebase_uid=? ORDER BY last_used_at DESC,id DESC LIMIT 20`).bind(user.uid).all()).results || [] });
	if (path === "/v1/me/search-history" && request.method === "POST") {
		await context.rateLimit(env, user.uid, "search-history", 30);
		const entry = parseSearchEntry(await context.readJson(request));
		if (entry.institutionId) {
			const school = await findInstitution(env, entry.institutionId);
			if (entry.state && school.state_name !== entry.state) throw new InputError("Institution is outside the selected state");
		}
		const normalized = entry.query.toLocaleLowerCase("en");
		const id = crypto.randomUUID();
		await env.DB.prepare(`INSERT INTO member_search_history
      (id,firebase_uid,kind,query,query_key,state_name,institution_id,category,location_name)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(firebase_uid,kind,query_key,state_name,institution_id,category,location_name)
      DO UPDATE SET query=excluded.query,last_used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(id, user.uid, entry.kind, entry.query, normalized, entry.state, entry.institutionId, entry.category, entry.location).run();
		await env.DB.prepare(`DELETE FROM member_search_history WHERE firebase_uid=? AND id NOT IN
      (SELECT id FROM member_search_history WHERE firebase_uid=? ORDER BY last_used_at DESC,id DESC LIMIT 20)`).bind(user.uid, user.uid).run();
		return json({ saved: true }, 201);
	}
	if (request.method === "DELETE") {
		await context.rateLimit(env, user.uid, "search-delete", 20);
		if (path === "/v1/me/search-history") {
			const kinds = url.searchParams.getAll("kind");
			if (kinds.length > 1 || kinds[0] && kinds[0] !== "gigs" && kinds[0] !== "people" || [...url.searchParams.keys()].some((key) => key !== "kind")) throw new InputError("Invalid history filter");
			if (kinds[0]) await env.DB.prepare("DELETE FROM member_search_history WHERE firebase_uid=? AND kind=?").bind(user.uid, kinds[0]).run();
			else await env.DB.prepare("DELETE FROM member_search_history WHERE firebase_uid=?").bind(user.uid).run();
			return json({ cleared: true });
		}
		const id = path.slice(22);
		await env.DB.prepare("DELETE FROM member_search_history WHERE firebase_uid=? AND id=?").bind(user.uid, id).run();
		return json({ removed: true });
	}
	return json({ error: "Method not allowed" }, 405);
}
// src/recommendations.ts
function memberInterests(raw) {
	try {
		const value = JSON.parse(raw);
		if (!Array.isArray(value)) return [];
		return [...new Set(value.filter((name) => typeof name === "string" && skillCategories.includes(name)))].slice(0, 5);
	} catch {
		return [];
	}
}
async function recommendations({ request, url, env, user, profile, json }) {
	if (url.pathname !== "/v1/me/recommended-gigs" || request.method !== "GET") return null;
	if (url.search) return json({ error: "Unsupported recommendation filter" }, 400);
	if (!profile.state_name) return json({
		gigs: [],
		reason: "choose_location",
		paymentsEnabled: false
	});
	const categories = memberInterests(profile.interests_json);
	const placeholders = categories.map(() => "?").join(",");
	const query = `SELECT g.id,g.title,g.description,g.category,g.price_kobo,g.delivery_days,g.location_type,
    g.location_name,g.payment_option,g.status,g.created_at,g.updated_at,g.state_name,g.institution_id,
    p.display_name AS provider_name,p.cg_username AS provider_username,p.campus AS provider_campus,
    pp.public_id AS provider_public_id,pp.verified_at,
    (CASE WHEN p.show_online=1 AND p.last_seen_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 minutes') THEN 1 ELSE 0 END) AS provider_online,
    (SELECT id FROM gig_images WHERE gig_id=g.id ORDER BY created_at LIMIT 1) AS cover_image_id,
    ${categories.length ? `CASE WHEN g.category IN (${placeholders}) THEN 1 ELSE 0 END` : "0"} AS interest_match,
    CASE WHEN EXISTS(SELECT 1 FROM provider_follows f WHERE f.provider_uid=g.provider_uid AND f.follower_uid=?) THEN 1 ELSE 0 END AS following_match
    FROM gigs g JOIN provider_profiles pp ON pp.firebase_uid=g.provider_uid
    JOIN profiles p ON p.firebase_uid=g.provider_uid
    WHERE ${publicGigWhere} AND g.state_name=? ${profile.institution_id ? "AND g.institution_id=?" : ""}
    ORDER BY interest_match DESC,following_match DESC,g.created_at DESC,g.id DESC LIMIT 6`;
	const params = [
		...categories,
		user.uid,
		profile.state_name,
		...profile.institution_id ? [profile.institution_id] : []
	];
	return json({
		gigs: (await env.DB.prepare(query).bind(...params).all()).results || [],
		reason: categories.length ? "interests" : "campus",
		paymentsEnabled: false
	});
}
// src/chats.ts
var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var reactions = /* @__PURE__ */ new Set([
	"❤️",
	"😂",
	"👍",
	"🔥",
	"😮",
	"😢",
	"🙌",
	"👏"
]);
var reactionKey = (value) => value.normalize("NFC").replace(/\uFE0F/g, "");
var canonicalReaction = (value) => typeof value === "string" && value.length <= 8 ? [...reactions].find((item) => reactionKey(item) === reactionKey(value.trim())) || null : null;
var stickers = /* @__PURE__ */ new Set([
	"💛",
	"✨",
	"🎉",
	"🤝",
	"🙏",
	"💪",
	"🥰",
	"✅",
	"🚀",
	"💯"
]);
var wallpapers = /* @__PURE__ */ new Set([
	"warm",
	"doodle",
	"gold",
	"night",
	"aurora"
]);
var cipherPattern = /^cg1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;
var fileKinds = /* @__PURE__ */ new Set([
	"image",
	"video",
	"file",
	"audio"
]);
var contentTypes = {
	"image/jpeg": {
		kind: "image",
		size: 8388608
	},
	"image/png": {
		kind: "image",
		size: 8388608
	},
	"image/webp": {
		kind: "image",
		size: 8388608
	},
	"image/gif": {
		kind: "image",
		size: 8388608
	},
	"video/mp4": {
		kind: "video",
		size: 12582912
	},
	"video/webm": {
		kind: "video",
		size: 12582912
	},
	"audio/webm": {
		kind: "audio",
		size: 8388608
	},
	"audio/ogg": {
		kind: "audio",
		size: 8388608
	},
	"audio/mp4": {
		kind: "audio",
		size: 8388608
	},
	"audio/mpeg": {
		kind: "audio",
		size: 8388608
	},
	"application/pdf": {
		kind: "file",
		size: 8388608
	},
	"text/plain": {
		kind: "file",
		size: 2097152
	},
	"application/msword": {
		kind: "file",
		size: 8388608
	},
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
		kind: "file",
		size: 8388608
	},
	"application/vnd.ms-excel": {
		kind: "file",
		size: 8388608
	},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
		kind: "file",
		size: 8388608
	}
};
var asObject = (value) => {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Invalid message");
	return value;
};
var noExtra = (value, keys) => {
	if (Object.keys(value).some((key) => !keys.includes(key))) throw new InputError("Unknown message field");
};
var now = () => (/* @__PURE__ */ new Date()).toISOString();
async function publicKey(value) {
	const data = asObject(value);
	noExtra(data, [
		"kty",
		"crv",
		"x",
		"y",
		"ext",
		"key_ops"
	]);
	if (data.kty !== "EC" || data.crv !== "P-256" || typeof data.x !== "string" || typeof data.y !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(data.x) || !/^[A-Za-z0-9_-]{43}$/.test(data.y)) throw new InputError("Invalid encryption public key");
	try {
		await crypto.subtle.importKey("jwk", {
			kty: "EC",
			crv: "P-256",
			x: data.x,
			y: data.y,
			ext: true,
			key_ops: []
		}, {
			name: "ECDH",
			namedCurve: "P-256"
		}, false, []);
	} catch {
		throw new InputError("Invalid encryption public key");
	}
	return {
		x: data.x,
		y: data.y
	};
}
async function secureEnabled(env, bookingId) {
	return !!await env.DB.prepare("SELECT booking_id FROM chat_security WHERE booking_id=?").bind(bookingId).first();
}
async function bookingFor(env, uid, id) {
	if (!uuid.test(id)) return null;
	return await env.DB.prepare(`SELECT b.id,b.buyer_uid,b.provider_uid,b.service_title,b.status,
    p.display_name AS other_name,p.avatar_url AS other_avatar,p.city AS other_city,p.state_name AS other_state,
    p.cg_username AS other_username,COALESCE(pp.public_id,p.member_public_id) AS other_public_id,
    CASE WHEN pp.public_id IS NOT NULL THEN 'provider' ELSE p.user_kind END AS other_kind,
    COALESCE(p.show_online,0) AS other_online
    FROM service_bookings b JOIN profiles p
      ON p.firebase_uid=CASE WHEN b.buyer_uid=? THEN b.provider_uid ELSE b.buyer_uid END
    LEFT JOIN provider_profiles pp ON pp.firebase_uid=p.firebase_uid AND pp.provider_status='active'
    WHERE b.id=? AND (b.buyer_uid=? OR b.provider_uid=?)`).bind(uid, id, uid, uid).first();
}
async function readLimited(request, max) {
	const header = request.headers.get("content-length");
	const size = header === null ? null : Number(header);
	if (size !== null && (!Number.isSafeInteger(size) || size < 1 || size > max)) throw new InputError("File too large");
	const reader = request.body?.getReader();
	if (!reader) throw new InputError("Choose a file");
	const chunks = [];
	let length = 0;
	while (true) {
		const chunk = await reader.read();
		if (chunk.done) break;
		length += chunk.value.byteLength;
		if (length > max) {
			await reader.cancel();
			throw new InputError("File too large");
		}
		chunks.push(chunk.value);
	}
	if (!length || size !== null && length !== size) throw new InputError("File size mismatch");
	const output = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}
async function chats(context) {
	const { request, url, env, user, json } = context;
	const { pathname: path } = url;
	if (!path.startsWith("/v1/chats/") && path !== "/v1/me/chats" && path !== "/v1/me/chat-key") return null;
	if (!user.emailVerified) return json({ error: "Verify your email before messaging" }, 403);
	if (path === "/v1/me/chat-key" && request.method === "GET") {
		const row = await env.DB.prepare("SELECT public_x,public_y FROM chat_identity_keys WHERE user_uid=?").bind(user.uid).first();
		return json({ publicKey: row ? {
			kty: "EC",
			crv: "P-256",
			x: row.public_x,
			y: row.public_y
		} : null });
	}
	if (path === "/v1/me/chat-key" && request.method === "POST") {
		await context.rateLimit(env, user.uid, "chat-key", 4);
		const data = asObject(await context.readJson(request));
		noExtra(data, ["publicKey"]);
		const key = await publicKey(data.publicKey);
		await env.DB.prepare("INSERT OR IGNORE INTO chat_identity_keys(user_uid,public_x,public_y) VALUES (?,?,?)").bind(user.uid, key.x, key.y).run();
		const row = await env.DB.prepare("SELECT public_x,public_y FROM chat_identity_keys WHERE user_uid=?").bind(user.uid).first();
		if (row?.public_x !== key.x || row.public_y !== key.y) return json({ error: "This account already has a different device key. Use the original device to read secure chats." }, 409);
		return json({
			publicKey: {
				kty: "EC",
				crv: "P-256",
				x: key.x,
				y: key.y
			},
			unchanged: true
		});
	}
	if (path === "/v1/me/chats" && request.method === "GET") return json({ chats: (await env.DB.prepare(`SELECT b.id AS booking_id,b.service_title,b.status,
      p.display_name AS other_name,p.avatar_url AS other_avatar,p.city AS other_city,p.state_name AS other_state,
      p.cg_username AS other_username,COALESCE(pp.public_id,p.member_public_id) AS other_public_id,
      CASE WHEN pp.public_id IS NOT NULL THEN 'provider' ELSE p.user_kind END AS other_kind,
      COALESCE(p.show_online,0) AS other_online,
      m.body AS last_body,m.kind AS last_kind,m.upload_id AS last_upload_id,\n      m.created_at AS last_at,m.cipher_version AS last_cipher_version,
      m.client_id AS last_client_id,m.sender_uid AS last_sender_uid,
      EXISTS(SELECT 1 FROM chat_security s WHERE s.booking_id=b.id) AS secure,
      (SELECT COUNT(*) FROM chat_messages unread WHERE unread.booking_id=b.id
        AND unread.sender_uid<>? AND unread.created_at>COALESCE(
        (SELECT last_read_at FROM chat_receipts r WHERE r.booking_id=b.id AND r.user_uid=?),''))
        AS unread_count
      FROM service_bookings b
      JOIN profiles p ON p.firebase_uid=CASE WHEN b.buyer_uid=? THEN b.provider_uid ELSE b.buyer_uid END
      LEFT JOIN provider_profiles pp ON pp.firebase_uid=p.firebase_uid AND pp.provider_status='active'
      LEFT JOIN chat_messages m ON m.id=(SELECT id FROM chat_messages
        WHERE booking_id=b.id ORDER BY created_at DESC,id DESC LIMIT 1)
      WHERE b.buyer_uid=? OR b.provider_uid=?
      ORDER BY COALESCE(m.created_at,b.requested_at) DESC,b.id DESC LIMIT 100`).bind(user.uid, user.uid, user.uid, user.uid, user.uid).all()).results || [] });
	const match = path.match(/^\/v1\/chats\/([0-9a-f-]{36})(?:\/(.*))?$/i);
	if (!match) return json({ error: "Not found" }, 404);
	const id = match[1], action = match[2] || "";
	const booking = await bookingFor(env, user.uid, id);
	if (!booking) return json({ error: "Chat not found" }, 404);
	const otherUid = booking.buyer_uid === user.uid ? booking.provider_uid : booking.buyer_uid;
	if (action === "keys" && request.method === "GET") {
		const rows = await env.DB.prepare("SELECT user_uid,public_x,public_y FROM chat_identity_keys WHERE user_uid IN (?,?)").bind(user.uid, otherUid).all();
		const get = (uid) => rows.results?.find((item) => item.user_uid === uid);
		const own = get(user.uid), other = get(otherUid);
		return json({
			self: own ? {
				uid: user.uid,
				publicKey: {
					kty: "EC",
					crv: "P-256",
					x: own.public_x,
					y: own.public_y
				}
			} : null,
			other: other ? {
				uid: otherUid,
				publicKey: {
					kty: "EC",
					crv: "P-256",
					x: other.public_x,
					y: other.public_y
				}
			} : null
		});
	}
	if (action === "secure/enable" && request.method === "POST") {
		await context.rateLimit(env, user.uid, "chat-secure", 5);
		if ((await env.DB.prepare("SELECT COUNT(*) AS total FROM chat_identity_keys WHERE user_uid IN (?,?)").bind(booking.buyer_uid, booking.provider_uid).first())?.total !== 2) return json({ error: "Both people need to open CampusGigs on their device before secure chat can be enabled" }, 409);
		await env.DB.prepare("INSERT OR IGNORE INTO chat_security(booking_id,enabled_by_uid) VALUES (?,?)").bind(id, user.uid).run();
		return json({ secure: true });
	}
	if (!action && request.method === "GET") {
		const [preferences, receipt, otherReceipt, typing, security] = await Promise.all([
			env.DB.prepare("SELECT wallpaper,muted FROM chat_preferences WHERE booking_id=? AND user_uid=?").bind(id, user.uid).first(),
			env.DB.prepare("SELECT last_read_at FROM chat_receipts WHERE booking_id=? AND user_uid=?").bind(id, user.uid).first(),
			env.DB.prepare("SELECT last_read_at FROM chat_receipts WHERE booking_id=? AND user_uid=?").bind(id, otherUid).first(),
			env.DB.prepare("SELECT expires_at,activity FROM chat_typing WHERE booking_id=? AND user_uid=?").bind(id, otherUid).first(),
			env.DB.prepare("SELECT enabled_at FROM chat_security WHERE booking_id=?").bind(id).first()
		]);
		return json({
			booking: {
				bookingId: id,
				serviceTitle: booking.service_title,
				status: booking.status,
				otherName: booking.other_name,
				otherAvatar: booking.other_avatar,
				otherCity: booking.other_city,
				otherState: booking.other_state,
				otherUsername: booking.other_username,
				otherPublicId: booking.other_public_id,
				otherKind: booking.other_kind,
				otherOnline: booking.other_online
			},
			preferences: preferences || {
				wallpaper: "warm",
				muted: 0
			},
			lastReadAt: receipt?.last_read_at || null,
			otherReadAt: otherReceipt?.last_read_at || null,
			otherTyping: !!typing && typing.expires_at > now(),
			otherActivity: typing && typing.expires_at > now() ? typing.activity : null,
			secure: !!security,
			secureSince: security?.enabled_at || null
		});
	}
	if (action === "messages" && request.method === "GET") {
		const before = url.searchParams.get("before") || "";
		if (before && !uuid.test(before)) throw new InputError("Invalid message cursor");
		const anchor = before ? await env.DB.prepare("SELECT created_at,id FROM chat_messages WHERE id=? AND booking_id=?").bind(before, id).first() : null;
		if (before && !anchor) return json({ error: "Message cursor not found" }, 400);
		const items = (await env.DB.prepare(`SELECT m.id,m.sender_uid,m.client_id,m.kind,m.body,m.upload_id,m.reply_to,m.cipher_version,m.media_group_id,
      m.pinned_by_uid,m.created_at,u.filename,u.mime_type,u.size_bytes,
      (SELECT body FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_body,
      (SELECT sender_uid FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_sender,
      (SELECT client_id FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_client_id,
      (SELECT kind FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_kind,
      (SELECT cipher_version FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_cipher_version
      FROM chat_messages m LEFT JOIN chat_uploads u ON u.id=m.upload_id
      WHERE m.booking_id=? AND (?='' OR m.created_at<? OR (m.created_at=? AND m.id<?))
      ORDER BY m.created_at DESC,m.id DESC LIMIT 41`).bind(id, before, anchor?.created_at || "", anchor?.created_at || "", before).all()).results || [];
		const visible = items.slice(0, 40);
		const ids = visible.map((item) => String(item.id));
		let reacted = [];
		if (ids.length) reacted = (await env.DB.prepare(`SELECT message_id,reactor_uid,emoji FROM chat_reactions
        WHERE message_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results || [];
		return json({
			messages: visible.reverse().map((item) => ({
				...item,
				reactions: reacted.filter((reaction) => reaction.message_id === item.id)
			})),
			hasMore: items.length > 40
		});
	}
	if (action === "updates" && request.method === "GET") {
		const after = url.searchParams.get("after") || "";
		if (after && !uuid.test(after)) throw new InputError("Invalid message cursor");
		const anchor = after ? await env.DB.prepare("SELECT created_at,id FROM chat_messages WHERE id=? AND booking_id=?").bind(after, id).first() : null;
		if (after && !anchor) return json({ error: "Message cursor not found" }, 400);
		const [rows, receipt, typing] = await Promise.all([
			env.DB.prepare(`SELECT m.id,m.sender_uid,m.client_id,m.kind,m.body,m.upload_id,m.reply_to,m.cipher_version,m.media_group_id,
        m.pinned_by_uid,m.created_at,u.filename,u.mime_type,u.size_bytes,
        (SELECT body FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_body,
        (SELECT sender_uid FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_sender,
        (SELECT client_id FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_client_id,
        (SELECT kind FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_kind,
        (SELECT cipher_version FROM chat_messages parent WHERE parent.id=m.reply_to) AS reply_cipher_version
        FROM chat_messages m LEFT JOIN chat_uploads u ON u.id=m.upload_id
        WHERE m.booking_id=? AND (?='' OR m.created_at>? OR (m.created_at=? AND m.id>?))
        ORDER BY m.created_at ASC,m.id ASC LIMIT 61`).bind(id, after, anchor?.created_at || "", anchor?.created_at || "", after).all(),
			env.DB.prepare("SELECT last_read_at FROM chat_receipts WHERE booking_id=? AND user_uid=?").bind(id, otherUid).first(),
			env.DB.prepare("SELECT expires_at,activity FROM chat_typing WHERE booking_id=? AND user_uid=?").bind(id, otherUid).first()
		]);
		const items = rows.results || [], visible = items.slice(0, 60);
		const ids = visible.map((item) => String(item.id));
		const reactions = ids.length ? await env.DB.prepare(`SELECT message_id,reactor_uid,emoji FROM chat_reactions
      WHERE message_id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all() : null;
		return json({
			messages: visible.map((item) => ({
				...item,
				reactions: (reactions?.results || []).filter((reaction) => reaction.message_id === item.id)
			})),
			hasMore: items.length > 60,
			otherReadAt: receipt?.last_read_at || null,
			otherTyping: !!typing && typing.expires_at > now(),
			otherActivity: typing && typing.expires_at > now() ? typing.activity : null
		});
	}
	if (action === "messages" && request.method === "POST") {
		await context.rateLimit(env, user.uid, "chat-message", 35);
		const data = asObject(await context.readJson(request));
		noExtra(data, [
			"clientId",
			"kind",
			"text",
			"replyTo",
			"uploadId",
			"groupId"
		]);
		const clientId = data.clientId;
		if (typeof clientId !== "string" || !uuid.test(clientId)) throw new InputError("Invalid message identifier");
		const kind = data.kind || "text";
		if (![
			"text",
			"image",
			"video",
			"file",
			"audio",
			"sticker"
		].includes(String(kind))) throw new InputError("Unsupported message type");
		const body = typeof data.text === "string" ? data.text.trim() : "";
		if (body.length > 2e3 || body.includes("\0")) throw new InputError("Message is too long");
		const encrypted = await secureEnabled(env, id);
		if (encrypted && !cipherPattern.test(body)) return json({ error: "Secure chat requires encrypted messages. Refresh the chat." }, 409);
		if (!encrypted && cipherPattern.test(body)) return json({ error: "Enable secure chat before sending encrypted messages" }, 409);
		const uploadId = data.uploadId || null;
		if (uploadId !== null && (typeof uploadId !== "string" || !uuid.test(uploadId))) throw new InputError("Invalid attachment");
		if (kind === "text" && (!body || uploadId)) throw new InputError("Type a message");
		if (kind === "sticker" && (!encrypted && !stickers.has(body) || !!uploadId)) throw new InputError("Choose a sticker");
		if ([
			"image",
			"video",
			"audio",
			"file"
		].includes(String(kind))) {
			if (!uploadId) throw new InputError("Attach a file");
			const upload = await env.DB.prepare("SELECT mime_type,cipher_version,encrypted_kind FROM chat_uploads WHERE id=? AND booking_id=? AND owner_uid=?").bind(uploadId, id, user.uid).first();
			if (!upload || upload.cipher_version !== (encrypted ? 1 : 0) || (encrypted ? upload.mime_type !== "application/octet-stream" || upload.encrypted_kind !== kind : contentTypes[upload.mime_type]?.kind !== kind)) return json({ error: "Attachment not available for this chat mode" }, 404);
		}
		const groupId = data.groupId || null;
		if (groupId !== null && (!uuid.test(String(groupId)) || ![
			"image",
			"video",
			"file"
		].includes(String(kind)))) throw new InputError("Invalid media album");
		if (groupId) {
			const owner = await env.DB.prepare("SELECT sender_uid FROM chat_messages WHERE booking_id=? AND media_group_id=? LIMIT 1").bind(id, groupId).first();
			if (owner && owner.sender_uid !== user.uid) throw new InputError("Invalid media album");
		}
		const replyTo = data.replyTo || null;
		if (replyTo !== null) {
			if (typeof replyTo !== "string" || !uuid.test(replyTo)) throw new InputError("Invalid reply");
			if (!await env.DB.prepare("SELECT id FROM chat_messages WHERE id=? AND booking_id=?").bind(replyTo, id).first()) return json({ error: "Reply message not found" }, 404);
		}
		const msgId = crypto.randomUUID();
		const result = await env.DB.prepare(`INSERT OR IGNORE INTO chat_messages
      (id,booking_id,sender_uid,client_id,kind,body,upload_id,reply_to,cipher_version,media_group_id) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(msgId, id, user.uid, clientId, kind, body, uploadId, replyTo, encrypted ? 1 : 0, groupId).run();
		const saved = await env.DB.prepare("SELECT id,booking_id,kind,body,created_at,client_id,upload_id,reply_to,cipher_version,media_group_id FROM chat_messages WHERE booking_id=? AND sender_uid=? AND client_id=?").bind(id, user.uid, clientId).first();
		if (!saved) return json({ error: "Attachment was already sent or message could not be saved" }, 409);
		return json({
			message: saved,
			reused: result.meta.changes === 0
		}, result.meta.changes === 0 ? 200 : 201);
	}
	if (action === "read" && request.method === "POST") {
		await env.DB.prepare(`INSERT INTO chat_receipts(booking_id,user_uid,last_read_at)
      VALUES (?,?,?) ON CONFLICT(booking_id,user_uid) DO UPDATE SET last_read_at=excluded.last_read_at`).bind(id, user.uid, now()).run();
		return json({ ok: true });
	}
	if (action === "typing" && request.method === "POST") {
		await context.rateLimit(env, user.uid, "chat-typing", 35);
		const data = asObject(await context.readJson(request));
		noExtra(data, ["active", "activity"]);
		if (typeof data.active !== "boolean") throw new InputError("Invalid typing status");
		if (data.activity !== void 0 && data.activity !== "typing" && data.activity !== "recording") throw new InputError("Invalid chat activity");
		const activity = data.active ? data.activity || "typing" : "typing";
		const expiry = new Date(Date.now() + (data.active ? 8e3 : 0)).toISOString();
		await env.DB.prepare(`INSERT INTO chat_typing(booking_id,user_uid,expires_at,activity) VALUES (?,?,?,?)
      ON CONFLICT(booking_id,user_uid) DO UPDATE SET expires_at=excluded.expires_at,activity=excluded.activity`).bind(id, user.uid, expiry, activity).run();
		return json({ ok: true });
	}
	if (action === "preferences" && request.method === "PUT") {
		const data = asObject(await context.readJson(request));
		noExtra(data, ["wallpaper", "muted"]);
		if (!wallpapers.has(String(data.wallpaper)) || typeof data.muted !== "boolean") throw new InputError("Invalid chat appearance");
		await env.DB.prepare(`INSERT INTO chat_preferences(booking_id,user_uid,wallpaper,muted)
      VALUES (?,?,?,?) ON CONFLICT(booking_id,user_uid) DO UPDATE SET
      wallpaper=excluded.wallpaper,muted=excluded.muted`).bind(id, user.uid, data.wallpaper, Number(data.muted)).run();
		return json({ preferences: {
			wallpaper: data.wallpaper,
			muted: Number(data.muted)
		} });
	}
	const reaction = action.match(/^messages\/([0-9a-f-]{36})\/reaction$/i);
	const pin = action.match(/^messages\/([0-9a-f-]{36})\/pin$/i);
	if ((reaction || pin) && ["PUT", "DELETE"].includes(request.method)) {
		const messageId = (reaction || pin)[1];
		if (!uuid.test(messageId)) return json({ error: "Message not found" }, 404);
		if (!await env.DB.prepare("SELECT id,sender_uid FROM chat_messages WHERE id=? AND booking_id=?").bind(messageId, id).first()) return json({ error: "Message not found" }, 404);
		if (reaction) {
			await context.rateLimit(env, user.uid, "chat-reaction", 40);
			if (request.method === "DELETE") await env.DB.prepare("DELETE FROM chat_reactions WHERE message_id=? AND reactor_uid=?").bind(messageId, user.uid).run();
			else {
				const data = asObject(await context.readJson(request));
				noExtra(data, ["emoji"]);
				const selected = canonicalReaction(data.emoji);
				if (!selected) throw new InputError("Choose an available reaction");
				await env.DB.prepare(`INSERT INTO chat_reactions(message_id,reactor_uid,emoji) VALUES (?,?,?)
          ON CONFLICT(message_id,reactor_uid) DO UPDATE SET emoji=excluded.emoji`).bind(messageId, user.uid, selected).run();
			}
			return json({ ok: true });
		}
		await context.rateLimit(env, user.uid, "chat-pin", 15);
		await env.DB.prepare("UPDATE chat_messages SET pinned_by_uid=? WHERE id=? AND booking_id=?").bind(request.method === "PUT" ? user.uid : null, messageId, id).run();
		return json({ ok: true });
	}
	if (action === "media" && request.method === "POST") {
		await context.rateLimit(env, user.uid, "chat-upload", 10);
		const mime = (request.headers.get("content-type") || "").split(";")[0].toLowerCase().trim();
		const encrypted = await secureEnabled(env, id);
		const encryptedKind = request.headers.get("x-encrypted-kind") || "";
		if (encrypted && (mime !== "application/octet-stream" || !fileKinds.has(encryptedKind))) return json({ error: "Secure chat requires encrypted attachments" }, 409);
		if (!encrypted && mime === "application/octet-stream") return json({ error: "Enable secure chat before uploading encrypted attachments" }, 409);
		const config = encrypted ? {
			kind: encryptedKind,
			size: 12582912
		} : contentTypes[mime];
		if (!config) return json({ error: "File type not supported" }, 415);
		const filename = encrypted ? "Encrypted attachment" : decodeURIComponent(request.headers.get("x-file-name") || "Attachment").replace(/[\x00-\x1f\\/]/g, "").slice(0, 100) || "Attachment";
		const bytes = await readLimited(request, config.size);
		if (encrypted && (bytes.byteLength < 32 || bytes[0] !== 67 || bytes[1] !== 71 || bytes[2] !== 49)) return json({ error: "Invalid encrypted attachment format" }, 422);
		const uploadId = crypto.randomUUID(), key = `chat-private/${id}/${uploadId}`;
		await env.MEDIA.put(key, bytes, {
			httpMetadata: { contentType: mime },
			customMetadata: {
				ownerUid: user.uid,
				scope: "booking-chat",
				cipherVersion: encrypted ? "1" : "0"
			}
		});
		try {
			await env.DB.prepare(`INSERT INTO chat_uploads(id,booking_id,owner_uid,object_key,filename,mime_type,size_bytes,cipher_version,encrypted_kind)
        VALUES (?,?,?,?,?,?,?,?,?)`).bind(uploadId, id, user.uid, key, filename, mime, bytes.byteLength, encrypted ? 1 : 0, encrypted ? encryptedKind : null).run();
		} catch (error) {
			await env.MEDIA.delete(key);
			throw error;
		}
		return json({ upload: {
			id: uploadId,
			kind: config.kind,
			filename,
			mimeType: mime,
			sizeBytes: bytes.byteLength
		} }, 201);
	}
	const media = action.match(/^media\/([0-9a-f-]{36})$/i);
	if (media && request.method === "GET") {
		const upload = await env.DB.prepare(`SELECT u.object_key,u.filename,u.mime_type,u.owner_uid
      FROM chat_uploads u WHERE u.id=? AND u.booking_id=? AND
        (u.owner_uid=? OR EXISTS(SELECT 1 FROM chat_messages m WHERE m.upload_id=u.id AND m.booking_id=?))`).bind(media[1], id, user.uid, id).first();
		if (!upload) return json({ error: "Attachment not found" }, 404);
		const object = await env.MEDIA.get(upload.object_key);
		if (!object) return json({ error: "Attachment unavailable" }, 404);
		return new Response(object.body, { headers: {
			"Content-Type": upload.mime_type,
			"Cache-Control": "private, max-age=60",
			"X-Content-Type-Options": "nosniff",
			"Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(upload.filename)}`
		} });
	}
	return json({ error: "Not found" }, 404);
}
// src/index.ts
function json(data, status = 200) {
	return Response.json(data, {
		status,
		headers: {
			"Cache-Control": "no-store",
			"X-Content-Type-Options": "nosniff"
		}
	});
}
var RateLimitError = class extends Error {};
function addCors(response, request, allowed) {
	const origin = request.headers.get("origin");
	if (origin && allowed.split(",").map((entry) => entry.trim()).includes(origin)) {
		response.headers.set("Access-Control-Allow-Origin", origin);
		response.headers.set("Vary", "Origin");
		response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-File-Name, X-Encrypted-Kind");
		response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
	}
	return response;
}
async function readBody(request) {
	const limit = 8192;
	if (Number(request.headers.get("content-length") || 0) > limit) throw new InputError("Request too large");
	if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new InputError("Content-Type must be application/json");
	const reader = request.body?.getReader();
	if (!reader) throw new InputError("Request body required");
	const decoder = new TextDecoder();
	let bytes = 0;
	let raw = "";
	while (true) {
		const chunk = await reader.read();
		if (chunk.done) break;
		bytes += chunk.value.byteLength;
		if (bytes > limit) {
			await reader.cancel();
			throw new InputError("Request too large");
		}
		raw += decoder.decode(chunk.value, { stream: true });
	}
	raw += decoder.decode();
	try {
		return JSON.parse(raw);
	} catch {
		throw new InputError("Invalid JSON");
	}
}
async function checkWriteRateLimit(env, uid, route = "profile", max = 20) {
	const bucket = Math.floor(Date.now() / (route.endsWith("-daily") ? 864e5 : 6e4));
	const key = `${route}:${uid}:${bucket}`;
	await env.DB.prepare(`
    INSERT INTO api_rate_limits (key, bucket, hits) VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET hits = hits + 1
  `).bind(key, bucket).run();
	if (((await env.DB.prepare("SELECT hits FROM api_rate_limits WHERE key = ?").bind(key).first())?.hits || 0) > max) throw new RateLimitError("Too many requests. Try again in a minute.");
}
async function ensureProfile(env, uid, email, displayName, picture) {
	const safeName = displayName.trim().slice(0, 60) || "CampusGigs member";
	await env.DB.prepare(`
    INSERT OR IGNORE INTO profiles (firebase_uid, email, display_name, avatar_url, cg_username)
    VALUES (?, ?, ?, ?, ?)
  `).bind(uid, email, safeName, picture.startsWith("https://") ? picture : "", "cg" + crypto.randomUUID().replaceAll("-", "").slice(0, 16)).run();
	await env.DB.prepare("UPDATE profiles SET email = ? WHERE firebase_uid = ? AND email != ?").bind(email, uid, email).run();
	const record = await env.DB.prepare("SELECT * FROM profiles WHERE firebase_uid = ?").bind(uid).first();
	if (!record) throw new Error("Unable to initialize profile");
	return record;
}
async function route(request, env) {
	const requestUrl = new URL(request.url);
	const path = requestUrl.pathname;
	if (path === "/health" && request.method === "GET") return json({
		service: "campusgigs-api",
		status: "ok",
		phase: "P",
		bookingsEnabled: true,
		messagingEnabled: true,
		secureMessaging: "opt-in-device-encrypted",
		paymentsEnabled: false
	});
	if (!path.startsWith("/v1/")) return json({ error: "Not found" }, 404);
	if (![
		"GET",
		"POST",
		"PATCH",
		"PUT",
		"DELETE"
	].includes(request.method)) return json({ error: "Method not allowed" }, 405);
	if (path.startsWith("/v1/public/")) return await community({
		request,
		url: requestUrl,
		env,
		user: null,
		json,
		readJson: readBody,
		rateLimit: checkWriteRateLimit,
		isAdmin: false
	}) || await phaseB({
		request,
		url: requestUrl,
		env,
		user: null,
		json,
		readJson: readBody,
		rateLimit: checkWriteRateLimit,
		isAdmin: false
	}) || json({ error: "Not found" }, 404);
	const user = await verifyFirebaseToken(request, env.FIREBASE_PROJECT_ID);
	if (path.startsWith("/v1/admin/")) {
		const grant = await env.DB.prepare(`
      SELECT r.role, p.account_status FROM platform_roles AS r
      JOIN profiles AS p ON p.firebase_uid = r.firebase_uid
      WHERE r.firebase_uid = ?
    `).bind(user.uid).first();
		assertAdminAccess(grant?.role, user.emailVerified, grant?.account_status);
		const phaseBResponse = await phaseB({
			request,
			url: requestUrl,
			env,
			user,
			json,
			readJson: readBody,
			rateLimit: checkWriteRateLimit,
			isAdmin: true
		});
		if (phaseBResponse) return phaseBResponse;
		if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
		if (path === "/v1/admin/bookings") return adminBookings(env, json);
		if (path === "/v1/admin/overview") {
			const totals = await env.DB.prepare(`
        SELECT COUNT(*) AS members,
          COALESCE(SUM(CASE WHEN active_mode = 'providing' THEN 1 ELSE 0 END), 0) AS providing,
          COALESCE(SUM(CASE WHEN active_mode = 'buying' THEN 1 ELSE 0 END), 0) AS buying,
          COALESCE(SUM(CASE WHEN account_status = 'suspended' THEN 1 ELSE 0 END), 0) AS suspended,
          COALESCE(SUM(CASE WHEN created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') THEN 1 ELSE 0 END), 0) AS new_week
        FROM profiles
      `).first();
			const recent = await env.DB.prepare(`
        SELECT firebase_uid, display_name, email, campus, city, active_mode, account_status, created_at
        FROM profiles ORDER BY created_at DESC, firebase_uid DESC LIMIT 6
      `).all();
			return json({
				totals,
				providers: await env.DB.prepare(`
        SELECT COUNT(*) AS applicants,
          SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved
        FROM provider_applications
      `).first(),
				gigCounts: await env.DB.prepare(`
        SELECT COUNT(*) AS total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active FROM gigs
      `).first(),
				bookingCounts: await env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='requested' THEN 1 ELSE 0 END) AS pending FROM service_bookings`).first(),
				recent: recent.results || [],
				phase: "G",
				dataSource: "CampusGigs D1"
			});
		}
		if (path === "/v1/admin/members") {
			let search, offset, limit;
			try {
				({search, offset, limit} = parseMemberSearch(requestUrl));
			} catch {
				throw new InputError("Invalid member search or page offset");
			}
			const pattern = `%${escapeLike(search)}%`;
			const rows = (await env.DB.prepare(`
        SELECT firebase_uid, display_name, email, campus, city, active_mode, account_status, created_at
        FROM profiles
        WHERE display_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\'
           OR campus LIKE ? ESCAPE '\\' OR city LIKE ? ESCAPE '\\'
           OR firebase_uid LIKE ? ESCAPE '\\'
        ORDER BY created_at DESC, firebase_uid DESC LIMIT ? OFFSET ?
      `).bind(pattern, pattern, pattern, pattern, pattern, limit + 1, offset).all()).results || [];
			return json({
				members: rows.slice(0, limit),
				nextOffset: rows.length > limit ? offset + limit : null
			});
		}
		return json({ error: "Not found" }, 404);
	}
	const profile = await ensureProfile(env, user.uid, user.emailVerified ? user.email : "", user.displayName, user.picture);
	if (profile.account_status !== "active") return json({ error: "Account suspended" }, 403);
	if (!profile.onboarding_completed && path !== "/v1/me" && path !== "/v1/me/onboarding") return json({ error: "Complete your CampusGigs welcome setup first" }, 403);
	const searchAccountResponse = await searchAccount({
		request,
		url: requestUrl,
		env,
		user,
		json,
		readJson: readBody,
		rateLimit: checkWriteRateLimit
	});
	if (searchAccountResponse) return searchAccountResponse;
	const communityResponse = await community({
		request,
		url: requestUrl,
		env,
		user,
		json,
		readJson: readBody,
		rateLimit: checkWriteRateLimit,
		isAdmin: false
	});
	if (communityResponse) return communityResponse;
	const phaseBResponse = await phaseB({
		request,
		url: requestUrl,
		env,
		user,
		json,
		readJson: readBody,
		rateLimit: checkWriteRateLimit,
		isAdmin: false
	});
	if (phaseBResponse) return phaseBResponse;
	const activityResponse = await notifications({
		request,
		url: requestUrl,
		env,
		user,
		json,
		rateLimit: checkWriteRateLimit
	});
	if (activityResponse) return activityResponse;
	const recommended = await recommendations({
		request,
		url: requestUrl,
		env,
		user,
		profile,
		json
	});
	if (recommended) return recommended;
	const bookingResponse = await bookings({
		request,
		url: requestUrl,
		env,
		user,
		json,
		readJson: readBody,
		rateLimit: checkWriteRateLimit
	});
	if (bookingResponse) return bookingResponse;
	const chatResponse = await chats({
		request,
		url: requestUrl,
		env,
		user,
		json,
		readJson: readBody,
		rateLimit: checkWriteRateLimit
	});
	if (chatResponse) return chatResponse;
	if (path === "/v1/me" && request.method === "GET") return json({
		profile,
		role: (await env.DB.prepare("SELECT role FROM platform_roles WHERE firebase_uid = ?").bind(user.uid).first())?.role || "member",
		emailVerified: user.emailVerified
	});
	if (path === "/v1/me/onboarding" && request.method === "PATCH") {
		if (!user.emailVerified) return json({ error: "Verify your email before completing your setup" }, 403);
		await checkWriteRateLimit(env, user.uid, "onboarding", 6);
		const value = parseOnboarding(await readBody(request));
		const institution = value.institutionId ? await findInstitution(env, value.institutionId) : null;
		if (institution && institution.state_name !== value.state) return json({ error: "That school is not in the selected state" }, 400);
		const academics = validateSchoolAcademics(institution?.id || "", value.faculty, value.department);
		await env.DB.prepare(`
      UPDATE profiles SET onboarding_completed=1,user_kind=?,age_range=?,student_status=?,interests_json=?,
        display_name=?,campus=?,city=?,state_name=?,institution_id=?,faculty=?,department=?,active_mode=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE firebase_uid=? AND account_status='active'
    `).bind(value.userKind, value.ageRange, value.studentStatus, JSON.stringify(value.interests), value.displayName, institution?.name || "", value.city, value.state, institution?.id || null, academics.faculty, academics.department, value.userKind === "provider" ? "providing" : "buying", user.uid).run();
		return json({ completed: true });
	}
	if (path === "/v1/me/location" && request.method === "PATCH") {
		if (!user.emailVerified) return json({ error: "Verify your email first" }, 403);
		await checkWriteRateLimit(env, user.uid, "location", 6);
		const body = await readBody(request);
		if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Select a location");
		const value = body;
		if (Object.keys(value).some((k) => ![
			"state",
			"institutionId",
			"faculty",
			"department"
		].includes(k))) throw new InputError("Unknown location field");
		if (typeof value.state !== "string" || !nigeriaStates.includes(value.state)) throw new InputError("Choose your state");
		const id = value.institutionId || "";
		if (typeof id !== "string" || id && !institutionIdPattern.test(id)) throw new InputError("Select a recognised institution");
		const institution = id ? await findInstitution(env, id) : null;
		if (institution && institution.state_name !== value.state) throw new InputError("Institution does not belong to that state");
		const academics = validateSchoolAcademics(institution?.id || "", value.faculty ?? profile.faculty ?? "", value.department ?? profile.department ?? "", {
			institutionId: profile.institution_id,
			faculty: profile.faculty,
			department: profile.department
		});
		if (!institution && (academics.faculty || academics.department)) throw new InputError("Select your institution before adding academic details");
		await env.DB.prepare(`UPDATE profiles SET state_name=?,institution_id=?,campus=?,faculty=?,department=?,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE firebase_uid=?`).bind(value.state, institution?.id || null, institution?.name || "", academics.faculty, academics.department, user.uid).run();
		return json({
			saved: true,
			state: value.state,
			institution: institution?.name || ""
		});
	}
	if (path === "/v1/me" && request.method === "PATCH") {
		await checkWriteRateLimit(env, user.uid);
		const changes = parseProfileUpdate(await readBody(request));
		if (changes.campus !== void 0) throw new InputError("Choose your school through the verified campus picker in Profile → Campus & privacy");
		const next = {
			display_name: changes.displayName ?? profile.display_name,
			bio: changes.bio ?? profile.bio,
			campus: profile.campus,
			city: changes.city ?? profile.city,
			avatar_url: changes.avatarUrl ?? profile.avatar_url
		};
		await env.DB.prepare(`
      UPDATE profiles SET display_name = ?, bio = ?, campus = ?, city = ?, avatar_url = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE firebase_uid = ?
    `).bind(next.display_name, next.bio, next.campus, next.city, next.avatar_url, user.uid).run();
		return json({ profile: {
			...profile,
			...next
		} });
	}
	if (path === "/v1/me/mode" && request.method === "PATCH") {
		await checkWriteRateLimit(env, user.uid);
		const mode = parseMode(await readBody(request));
		await env.DB.prepare(`
      UPDATE profiles SET active_mode = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE firebase_uid = ?
    `).bind(mode, user.uid).run();
		return json({ mode });
	}
	return json({ error: "Not found" }, 404);
}
// \0virtual:cloudflare/worker-entry
var worker_entry_default = { async fetch(request, env) {
	const origin = request.headers.get("origin");
	const allowed = env.WEB_ORIGINS.split(",").map((entry) => entry.trim());
	if (origin && !allowed.includes(origin)) return json({ error: "Origin not allowed" }, 403);
	if (request.method === "OPTIONS") return addCors(new Response(null, { status: 204 }), request, env.WEB_ORIGINS);
	try {
		return addCors(await route(request, env), request, env.WEB_ORIGINS);
	} catch (error) {
		const status = error instanceof AuthError ? 401 : error instanceof AdminAccessError ? 403 : error instanceof RateLimitError ? 429 : error instanceof InputError ? 400 : 500;
		if (status === 500) console.error(JSON.stringify({
			event: "request_failed",
			path: new URL(request.url).pathname
		}));
		return addCors(json({ error: status === 500 ? "Service temporarily unavailable" : error.message }, status), request, env.WEB_ORIGINS);
	}
} };
export { worker_entry_default as default };

//# sourceMappingURL=index.js.map