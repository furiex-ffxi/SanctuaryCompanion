export class D2SParserAdapter {

  static async fetchList() {
    const res = await fetch('/__d2s_list');
    if (!res.ok) throw new Error('Failed to fetch file list');
    return await res.json();
  }

  static async fetchRefresh(filename) {
    const res = await fetch(`/__d2s_refresh?file=${encodeURIComponent(filename)}`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }
    return await res.json();
  }

  static async fetchSharedStash(filename = 'ModernSharedStashSoftCoreV2.d2i') {
    const res = await fetch(`/__d2i_refresh?file=${encodeURIComponent(filename)}`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }
    return await res.json();
  }

  static async parseBuffer(buffer) {
    const res = await fetch('/__d2s_parse_buffer', {
      method: 'POST',
      body: buffer,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }
    return await res.json();
  }

  static async parseSharedStashBuffer(buffer) {
    const res = await fetch('/__d2i_parse_buffer', {
      method: 'POST',
      body: buffer,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }
    return await res.json();
  }

  static async removeItemFromSharedStash(filename, item) {
    const res = await fetch('/__d2i_remove_item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename, item }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }
    return await res.json();
  }

  static async addItemToSharedStash(filename, item) {
    const res = await fetch('/__d2i_add_item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename, item }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }
    return await res.json();
  }

  static async removeItemFromSave(filename, item) {
    const res = await fetch('/__d2s_remove_item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename, item }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }
    return await res.json();
  }

  static async addItemToSave(filename, item) {
    const res = await fetch('/__d2s_add_item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename, item }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }
    return await res.json();
  }
}

