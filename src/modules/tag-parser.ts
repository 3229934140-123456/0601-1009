import { TagInfo, Asset } from '../types';
import { store } from '../store';
import { calculateChecksum } from '../utils';

export type TagFormat = 'standard_qr' | 'simple_qr' | 'barcode_128' | 'rfid_epc' | 'custom';

export class TagParser {
  parseQRCode(content: string): TagInfo {
    let tagInfo: TagInfo | null = null;

    tagInfo = this.tryParseStandardQR(content);
    if (tagInfo) return tagInfo;

    tagInfo = this.tryParseSimpleQR(content);
    if (tagInfo) return tagInfo;

    tagInfo = this.tryParseJSON(content);
    if (tagInfo) return tagInfo;

    return {
      assetNo: content.trim(),
      tagType: 'qr',
      rawContent: content
    };
  }

  parseBarcode(content: string): TagInfo {
    return {
      assetNo: content.trim(),
      tagType: 'barcode',
      rawContent: content
    };
  }

  parseRFID(content: string): TagInfo {
    return {
      assetNo: content.trim(),
      tagType: 'rfid',
      rawContent: content
    };
  }

  parse(content: string, tagType?: 'qr' | 'barcode' | 'rfid'): TagInfo {
    switch (tagType) {
      case 'qr':
        return this.parseQRCode(content);
      case 'barcode':
        return this.parseBarcode(content);
      case 'rfid':
        return this.parseRFID(content);
      default:
        return this.autoDetectAndParse(content);
    }
  }

  autoDetectAndParse(content: string): TagInfo {
    if (content.startsWith('{') || content.startsWith('[')) {
      return this.parseQRCode(content);
    }
    if (content.startsWith('AST:') || content.startsWith('ASSET:')) {
      return this.parseQRCode(content);
    }
    if (/^[0-9A-Z]{8,}$/.test(content)) {
      return this.parseBarcode(content);
    }
    return this.parseQRCode(content);
  }

  private tryParseStandardQR(content: string): TagInfo | null {
    const match = content.match(/^AST:([A-Z0-9]+)\|v1\|([a-f0-9]{8})$/i);
    if (match) {
      const assetNo = match[1];
      const checksum = match[2];
      const expectedChecksum = calculateChecksum(assetNo + 'v1').substring(0, 8);
      const isValid = checksum.toLowerCase() === expectedChecksum.toLowerCase();

      return {
        assetNo,
        tagType: 'qr',
        encodeVersion: '1',
        checksum: isValid ? checksum : undefined,
        rawContent: content
      };
    }
    return null;
  }

  private tryParseSimpleQR(content: string): TagInfo | null {
    const match = content.match(/^ASSET:(.+)$/i);
    if (match) {
      return {
        assetNo: match[1],
        tagType: 'qr',
        rawContent: content
      };
    }
    return null;
  }

  private tryParseJSON(content: string): TagInfo | null {
    try {
      const data = JSON.parse(content);
      if (data.assetNo || data.asset_id || data.id) {
        return {
          assetNo: data.assetNo || data.asset_id || data.id,
          tagType: 'qr',
          encodeVersion: data.version,
          checksum: data.checksum,
          rawContent: content,
          extra: data
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  generateQRContent(assetNo: string, version: string = '1'): string {
    const checksum = calculateChecksum(assetNo + 'v' + version).substring(0, 8);
    return `AST:${assetNo}|v${version}|${checksum}`;
  }

  generateBarcodeContent(assetNo: string): string {
    return assetNo;
  }

  validateTag(tagInfo: TagInfo): boolean {
    if (!tagInfo.assetNo) return false;
    if (tagInfo.checksum && tagInfo.encodeVersion) {
      const expected = calculateChecksum(tagInfo.assetNo + 'v' + tagInfo.encodeVersion).substring(0, 8);
      return tagInfo.checksum.toLowerCase() === expected.toLowerCase();
    }
    return true;
  }

  findAssetByTag(content: string, tagType?: 'qr' | 'barcode' | 'rfid'): Asset | undefined {
    const tagInfo = this.parse(content, tagType);
    if (!tagInfo.assetNo) return undefined;
    return store.getAssetByNo(tagInfo.assetNo);
  }

  detectFormat(content: string): TagFormat {
    if (/^AST:[A-Z0-9]+\|v\d+\|[a-f0-9]{8}$/i.test(content)) {
      return 'standard_qr';
    }
    if (/^ASSET:.+$/i.test(content)) {
      return 'simple_qr';
    }
    if (content.startsWith('{')) {
      try {
        JSON.parse(content);
        return 'custom';
      } catch {
        // ignore
      }
    }
    if (/^[0-9A-Z]{8,20}$/.test(content)) {
      return 'barcode_128';
    }
    if (/^[0-9A-F]{24}$/i.test(content)) {
      return 'rfid_epc';
    }
    return 'custom';
  }
}

export const tagParser = new TagParser();
