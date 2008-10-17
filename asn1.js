function Stream(enc, pos) {
    if (enc instanceof Stream) {
        this.enc = enc.enc;
        this.pos = enc.pos;
    } else {
        this.enc = enc;
        this.pos = pos;
    }
}
Stream.prototype.get = function() {
    return this.enc[this.pos++];
}

function ASN1(stream, header, length, tag, sub) {
    this.stream = stream;
    this.header = header;
    this.length = length;
    this.tag = tag;
    this.sub = sub;
}
ASN1.prototype.typeName = function() {
    if (this.tag == undefined)
	return "unknown";
    var tagClass = this.tag >> 6;
    var tagConstructed = (this.tag >> 5) & 1;
    var tagNumber = this.tag & 0x1F;
    switch (tagClass) {
    case 0: // universal
	switch (tagNumber) {
	case 0x00: return "EOC";
	case 0x01: return "BOOLEAN";
	case 0x02: return "INTEGER";
	case 0x03: return "BIT_STRING";
	case 0x04: return "OCTET_STRING";
	case 0x05: return "NULL";
	case 0x06: return "OBJECT_IDENTIFIER";
	case 0x07: return "ObjectDescriptor";
	case 0x08: return "EXTERNAL";
	case 0x09: return "REAL";
	case 0x0A: return "ENUMERATED";
	case 0x0B: return "EMBEDDED_PDV";
	case 0x0C: return "UTF8String";
	case 0x10: return "SEQUENCE";
	case 0x11: return "SET";
	case 0x12: return "NumericString";
	case 0x13: return "PrintableString"; // ASCII subset
	case 0x14: return "TeletexString"; // aka T61String
	case 0x15: return "VideotexString";
	case 0x16: return "IA5String"; // ASCII
	case 0x17: return "UTCTime";
	case 0x18: return "GeneralizedTime";
	case 0x19: return "GraphicString";
	case 0x1A: return "VisibleString"; // ASCII subset
	case 0x1B: return "GeneralString";
	case 0x1C: return "UniversalString";
	case 0x1E: return "BMPString";
	default: return "Universal_" + tagNumber.toString(16);
	}
    case 1: return "Application_" + tagNumber.toString(16);
    case 2: return "[" + tagNumber + "]"; // Context
    case 3: return "Private_" + tagNumber.toString(16);
    }
}
ASN1.prototype.toString = function() {
    return this.typeName() + "@" + this.stream.pos + "[header:" + this.header + ",length:" + this.length + ",sub:" + (this.sub == null ? 'null' : this.sub.length) + "]";
}
ASN1.prototype.print = function(indent) {
    if (indent == undefined) indent = '';
    document.writeln(indent + this);
    if (this.sub != null) {
        indent += '  ';
        for (var i = 0, max = this.sub.length; i < max; ++i)
            this.sub[i].print(indent);
    }
}
ASN1.prototype.toPrettyString = function(indent) {
    if (indent == undefined) indent = '';
    var s = indent + this.typeName() + " @" + this.stream.pos;
    if (this.length >= 0)
	s += "+";
    s += this.length;
    if (this.tag & 0x20)
	s += " (constructed)";
    else if (((this.tag == 0x03) || (this.tag == 0x04)) && (this.sub != null))
	s += " (encapsulates)";
    s += "\n";
    if (this.sub != null) {
        indent += '  ';
        for (var i = 0, max = this.sub.length; i < max; ++i)
            s += this.sub[i].toPrettyString(indent);
    }
    return s;
}
ASN1.prototype.toDOM = function() {
    var node = document.createElement("div");
    node.className = "node";
    node.asn1 = this;
    var head = document.createElement("div");
    head.className = "head";
    var s = this.typeName() + " @" + this.stream.pos;
    if (this.length >= 0)
	s += "+";
    s += this.length;
    if (this.tag & 0x20)
	s += " (constructed)";
    else if (((this.tag == 0x03) || (this.tag == 0x04)) && (this.sub != null))
	s += " (encapsulates)";
    s += "\n";
    head.innerHTML = s;
    node.appendChild(head);
    var sub = document.createElement("div");
    sub.className = "sub";
    if (this.sub != null) {
        for (var i = 0, max = this.sub.length; i < max; ++i)
            sub.appendChild(this.sub[i].toDOM());
    }
    node.appendChild(sub);
    head.switchNode = sub;
    head.onclick = function() {
	var style = this.switchNode.style;
	style.display = (style.display == "none") ? "block" : "none";
    };
    return node;
}
ASN1.decodeLength = function(stream) {
    var buf = stream.get();
    var len = buf & 0x7F;
    if (len == buf)
        return len;
    if (len > 3)
        throw "Length over 24 bits not supported at position " + (stream.pos - 1);
    if (len == 0)
	return -1; // undefined
    buf = 0;
    for (var i = 0; i < len; ++i)
        buf = (buf << 8) | stream.get();
    return buf;
}
ASN1.hasContent = function(tag, len, stream) {
    if (tag & 0x20) // constructed
	return true;
    if ((tag < 0x03) || (tag > 0x04))
	return false;
    var p = new Stream(stream);
    if (tag == 0x03) p.get(); // BitString unused bits, must be in [0, 7]
    var subTag = p.get();
    if ((subTag >> 6) & 0x01) // not (universal or context)
	return false;
    try {
	var subLength = ASN1.decodeLength(p);
	return ((p.pos - stream.pos) + subLength == len);
    } catch (exception) {
	return false;
    }
}
ASN1.decode = function(stream) {
    if (!(stream instanceof Stream))
        stream = new Stream(stream, 0);
    var streamStart = new Stream(stream);
    var tag = stream.get();
    var len = ASN1.decodeLength(stream);
    var header = stream.pos - streamStart.pos;
    var sub = null;
    if (ASN1.hasContent(tag, len, stream)) {
	var start = stream.pos;
	// it's constructed, so we have to decode content
	if (tag == 0x03) stream.get(); // BitString unused bits, must be in [0, 7]
        sub = [];
	if (len >= 0) {
	    // definite length
	    var end = start + len;
	    while (stream.pos < end)
		sub[sub.length] = ASN1.decode(stream);
	    if (stream.pos != end)
		throw "Content overflowed the constructed container";
	} else {
	    // undefined length
	    for (;;) {
		var s = ASN1.decode(stream);
		if (s.tag == 0)
		    break;
		sub[sub.length] = s;
	    }
	    len = start - stream.pos;
	}
    } else
        stream.pos += len; // skip content
    return new ASN1(streamStart, header, len, tag, sub);
}
ASN1.test = function() {
    var test = [
        { value: [0x27],                   expected: 0x27     },
        { value: [0x81, 0xC9],             expected: 0xC9     },
        { value: [0x83, 0xFE, 0xDC, 0xBA], expected: 0xFEDCBA },
    ];
    for (var i = 0, max = test.length; i < max; ++i) {
        var pos = 0;
        var stream = new Stream(test[i].value, 0);
        var res = ASN1.decodeLength(stream);
        if (res != test[i].expected)
            document.write("In test[" + i + "] expected " + test[i].expected + " got " + res + "\n");
    }
}