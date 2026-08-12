using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
using D2SSharp.Model;
using D2SSharp.Enums;

namespace D2RStashWorker
{
    public class GemMod
    {
        public string Code { get; set; } = "";
        public int Value { get; set; }
    }

    public class GemEntry
    {
        public List<GemMod> WeaponMods { get; set; } = new();
        public List<GemMod> HelmMods { get; set; } = new();
        public List<GemMod> ShieldMods { get; set; } = new();
    }

    public class ItemTransform
    {
        public string InvTransform { get; set; } = "";
        public string ChrTransform { get; set; } = "";
        public string TransformColor { get; set; } = "";
    }

    public static class D2Data
    {
        private static Dictionary<int, string> _uniques = new();
        private static Dictionary<int, (string ItemName, string SetName)> _sets = new();
        private static Dictionary<string, ItemTransform> _uniqueTransforms = new();
        private static Dictionary<string, ItemTransform> _setTransforms = new();
        private static Dictionary<int, ItemTransform> _setTransformsById = new();
        private static Dictionary<string, GemEntry> _gems = new();
        private static Dictionary<string, (string Normal, string Unique, string Set)> _itemImages = new();
        private static Dictionary<string, string[]> _itemGfx = new();

        private static readonly HashSet<string> _shieldCodes = new()
        {
            "buc", "sml", "lrg", "kit", "tow", "gts", "bsh", "spk", "xuc", "xml",
            "xrg", "xit", "xow", "xts", "xsh", "xpk", "pa1", "pa2", "pa3", "pa4",
            "pa5", "ne1", "ne2", "ne3", "ne4", "ne5", "uuc", "uml", "urg", "uit",
            "uow", "uts", "ush", "upk", "pa6", "pa7", "pa8", "pa9", "paa", "ne6",
            "ne7", "ne8", "ne9", "nea", "pab", "pac", "pad", "pae", "paf", "neb",
            "neg", "ned", "nee", "nef"
        };

        private static readonly Dictionary<int, string> _runewords = new()
        {
            { 27, "Ancients' Pledge" }, { 28, "Armageddon" }, { 29, "Authority" }, { 30, "Beast" },
            { 31, "Beauty" }, { 32, "Black" }, { 33, "Blood" }, { 34, "Bone" }, { 35, "Bramble" },
            { 36, "Brand" }, { 37, "Breath of the Dying" }, { 38, "Call to Arms" },
            { 40, "Chains of Honor" }, { 41, "Chance" }, { 42, "Chaos" }, { 43, "Crescent Moon" },
            { 44, "Darkness" }, { 45, "Daylight" }, { 46, "Death" }, { 47, "Deception" }, { 48, "Delirium" },
            { 49, "Desire" }, { 50, "Despair" }, { 51, "Destruction" }, { 52, "Doom" }, { 53, "Dragon" },
            { 54, "Dread" }, { 55, "Dream" }, { 56, "Duress" }, { 57, "Edge" }, { 58, "Elation" },
            { 59, "Enigma" }, { 60, "Enlightenment" }, { 61, "Envy" }, { 62, "Eternity" }, { 63, "Exile" },
            { 64, "Faith" }, { 65, "Famine" }, { 66, "Flickering Flame" }, { 67, "Fortitude" },
            { 68, "Fortune" }, { 69, "Friendship" }, { 70, "Fury" }, { 71, "Gloom" }, { 72, "Glory" },
            { 73, "Grief" }, { 74, "Hand of Justice" }, { 75, "Harmony" }, { 76, "Hatred" },
            { 77, "Heart of the Oak" }, { 78, "Heaven's Will" }, { 79, "Holy Tears" }, { 80, "Holy Thunder" },
            { 81, "Honor" }, { 82, "Revenge" }, { 83, "Humility" }, { 84, "Hunger" }, { 85, "Ice" },
            { 86, "Infinity" }, { 87, "Innocence" }, { 88, "Insight" }, { 89, "Jealousy" }, { 90, "Judgement" },
            { 91, "King's Grace" }, { 92, "Kingslayer" }, { 93, "Knight's Vigil" }, { 94, "Knowledge" },
            { 95, "Last Wish" }, { 96, "Law" }, { 97, "Lawbringer" }, { 98, "Leaf" }, { 99, "Lightning" },
            { 100, "Lionheart" }, { 101, "Love" }, { 102, "Loyalty" }, { 103, "Lust" }, { 104, "Madness" },
            { 106, "Malice" }, { 107, "Melody" }, { 108, "Memory" }, { 109, "Mist" }, { 110, "Morning" },
            { 111, "Mystery" }, { 112, "Myth" }, { 113, "Nadir" }, { 114, "Nature's Kingdom" },
            { 115, "Night" }, { 116, "Oath" }, { 117, "Obedience" }, { 118, "Oblivion" }, { 119, "Obsession" },
            { 120, "Passion" }, { 121, "Patience" }, { 122, "Pattern" }, { 123, "Peace" }, { 124, "Voice of Reason" },
            { 125, "Penitence" }, { 126, "Peril" }, { 127, "Pestilence" }, { 128, "Phoenix" }, { 129, "Piety" },
            { 130, "Pillar of Faith" }, { 131, "Plague" }, { 132, "Praise" }, { 133, "Prayer" },
            { 134, "Pride" }, { 135, "Principle" }, { 136, "Prowess in Battle" }, { 137, "Prudence" },
            { 138, "Punishment" }, { 139, "Purity" }, { 140, "Question" }, { 141, "Radiance" },
            { 142, "Rain" }, { 143, "Reason" }, { 144, "Red" }, { 145, "Rhyme" }, { 146, "Rift" },
            { 147, "Sanctuary" }, { 148, "Serendipity" }, { 149, "Shadow" }, { 150, "Shadow of Doubt" },
            { 151, "Silence" }, { 152, "Siren's Song" }, { 153, "Smoke" }, { 154, "Sorrow" },
            { 155, "Spirit" }, { 156, "Splendor" }, { 157, "Starlight" }, { 158, "Stealth" }, { 159, "Steel" },
            { 160, "Still Water" }, { 161, "Sting" }, { 162, "Stone" }, { 163, "Storm" }, { 164, "Strength" },
            { 165, "Tempest" }, { 166, "Temptation" }, { 167, "Terror" }, { 168, "Thirst" }, { 169, "Thought" },
            { 170, "Thunder" }, { 171, "Time" }, { 172, "Tradition" }, { 173, "Treachery" }, { 174, "Trust" },
            { 175, "Truth" }, { 176, "Unbending Will" }, { 177, "Valor" }, { 178, "Vengeance" },
            { 179, "Venom" }, { 180, "Victory" }, { 181, "Voice" }, { 182, "Void" }, { 183, "War" },
            { 184, "Water" }, { 185, "Wealth" }, { 186, "Whisper" }, { 187, "White" }, { 188, "Wind" },
            { 189, "Wings of Hope" }, { 190, "Wisdom" }, { 191, "Woe" }, { 192, "Wonder" }, { 193, "Wrath" },
            { 194, "Youth" }, { 195, "Zephyr" }, { 196, "Hustle" }, { 197, "Hustle" }, { 198, "Mosaic" },
            { 199, "Metamorphosis" }, { 200, "Ground" }, { 201, "Temper" }, { 202, "Hearth" },
            { 203, "Cure" }, { 204, "Bulwark" }
        };

        private static void LoadItemImageData()
        {
            var assembly = Assembly.GetExecutingAssembly();
            using (var stream = assembly.GetManifestResourceStream("D2RStashWorker.Data.item_images.tsv"))
            using (var reader = stream == null ? null : new StreamReader(stream))
            {
                if (reader != null) {
                    reader.ReadLine();
                    while (!reader.EndOfStream)
                    {
                        var parts = reader.ReadLine()?.Split('\t') ?? [];
                        if (parts.Length >= 2 && !string.IsNullOrWhiteSpace(parts[0]) && !string.IsNullOrWhiteSpace(parts[1]))
                            _itemImages[parts[0].Trim()] = (parts[1].Trim(), parts.ElementAtOrDefault(2)?.Trim() ?? "", parts.ElementAtOrDefault(3)?.Trim() ?? "");
                    }
                }
            }
            using (var stream = assembly.GetManifestResourceStream("D2RStashWorker.Data.item_gfx.tsv"))
            using (var reader = stream == null ? null : new StreamReader(stream))
            {
                if (reader != null) {
                    reader.ReadLine();
                    while (!reader.EndOfStream)
                    {
                        var parts = reader.ReadLine()?.Split('\t') ?? [];
                        if (parts.Length >= 2 && !string.IsNullOrWhiteSpace(parts[0]))
                            _itemGfx[parts[0].Trim()] = parts.Skip(1).Select(p => p.Trim()).Where(p => p.Length > 0).ToArray();
                    }
                }
            }
        }
        private static ItemTransform ReadTransform(string[] headers, string[] parts)
        {
            string Value(string column)
            {
                var index = System.Array.IndexOf(headers, column);
                return index >= 0 && index < parts.Length ? parts[index].Trim() : "";
            }
            var inv = Value("invtransform");
            var chr = Value("chrtransform");
            return new ItemTransform { InvTransform = inv, ChrTransform = chr, TransformColor = inv.Length > 0 ? inv : chr };
        }

        static D2Data()
        {
            try
            {
                LoadItemImageData();
                var assembly = Assembly.GetExecutingAssembly();
                using (var stream = assembly.GetManifestResourceStream("D2RStashWorker.Data.uniqueitems.txt"))
                {
                    if (stream != null)
                    {
                        using var reader = new StreamReader(stream);
                        var headers = (reader.ReadLine() ?? "").Split('	');
                        while (!reader.EndOfStream)
                        {
                            var line = reader.ReadLine();
                            if (string.IsNullOrWhiteSpace(line)) continue;
                            var parts = line.Split('\t');
                            if (parts.Length > 1 && int.TryParse(parts[1], out int id))
                            {
                                _uniques[id] = parts[0];
                                _uniqueTransforms[parts[0]] = ReadTransform(headers, parts);
                            }
                        }
                    }
                }
                using (var stream = assembly.GetManifestResourceStream("D2RStashWorker.Data.setitems.txt"))
                {
                    if (stream != null)
                    {
                        using var reader = new StreamReader(stream);
                        var headers = (reader.ReadLine() ?? "").Split('	');
                        while (!reader.EndOfStream)
                        {
                            var line = reader.ReadLine();
                            if (string.IsNullOrWhiteSpace(line)) continue;
                            var parts = line.Split('\t');
                            if (parts.Length > 2 && int.TryParse(parts[1], out int id))
                            {
                                _sets[id] = (parts[0], parts[2]);
                                _setTransforms[parts[0]] = ReadTransform(headers, parts);
                                _setTransformsById[id] = _setTransforms[parts[0]];
                            }
                        }
                    }
                }
                using (var stream = assembly.GetManifestResourceStream("D2RStashWorker.Data.gems.txt"))
                {
                    if (stream != null)
                    {
                        using var reader = new StreamReader(stream);
                        reader.ReadLine(); // Read header
                        while (!reader.EndOfStream)
                        {
                            var line = reader.ReadLine();
                            if (string.IsNullOrWhiteSpace(line)) continue;
                            var parts = line.Split('\t');
                            if (parts.Length > 30)
                            {
                                var code = parts[3].Trim();
                                if (string.IsNullOrEmpty(code)) continue;

                                var entry = new GemEntry();

                                void AddMod(List<GemMod> mods, string modCode, string minStr)
                                {
                                    if (!string.IsNullOrWhiteSpace(modCode) && int.TryParse(minStr, out int val) && val > 0)
                                    {
                                        mods.Add(new GemMod { Code = modCode.Trim(), Value = val });
                                    }
                                }

                                if (parts.Length > 4) AddMod(entry.WeaponMods, parts[4], parts[6]);
                                if (parts.Length > 8) AddMod(entry.WeaponMods, parts[8], parts[10]);
                                if (parts.Length > 12) AddMod(entry.WeaponMods, parts[12], parts[14]);

                                if (parts.Length > 16) AddMod(entry.HelmMods, parts[16], parts[18]);
                                if (parts.Length > 20) AddMod(entry.HelmMods, parts[20], parts[22]);
                                if (parts.Length > 24) AddMod(entry.HelmMods, parts[24], parts[26]);

                                if (parts.Length > 28) AddMod(entry.ShieldMods, parts[28], parts[30]);
                                if (parts.Length > 32) AddMod(entry.ShieldMods, parts[32], parts[34]);
                                if (parts.Length > 36) AddMod(entry.ShieldMods, parts[36], parts[38]);

                                _gems[code] = entry;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Error loading game data: {ex.Message}");
            }
        }

        public static string? GetUniqueName(int id) => _uniques.TryGetValue(id, out var val) ? val : null;
        public static ItemTransform? GetUniqueTransform(string? name) => name != null && _uniqueTransforms.TryGetValue(name, out var val) ? val : null;
        public static ItemTransform? GetSetTransform(string? name) => name != null && _setTransforms.TryGetValue(name, out var val) ? val : null;
        public static ItemTransform? GetSetTransform(int id) => _setTransformsById.TryGetValue(id, out var val) ? val : null;
        public static (string ItemName, string SetName)? GetSetItem(int id)
        {
            if (!_sets.TryGetValue(id, out var val)) return null;
            // setitems.txt retains this legacy internal name; D2R displays Guardianship.
            if (val.ItemName == "Tal Rasha's Howling Wind") val.ItemName = "Tal Rasha's Guardianship";
            return val;
        }
        public static string? GetRunewordName(int id) => _runewords.TryGetValue(id, out var val) ? val : null;

        public static string? GetInventoryFile(Item item)
        {
            var type = item.ItemCodeString.Trim().ToLowerInvariant();
            var gfxType = type switch
            {
                "rin" => "ring", "amu" => "amul", "jew" => "jewl",
                "cm1" => "scha", "cm2" => "mcha", "cm3" => "lcha", _ => ""
            };
            if (gfxType.Length > 0 && _itemGfx.TryGetValue(gfxType, out var gfxFiles) && gfxFiles.Length > 0)
            {
                var gfxIndex = Math.Clamp((int)(item.VariableGfxId ?? 0), 0, gfxFiles.Length - 1);
                return gfxFiles[gfxIndex];
            }
            if (type == "box") return "invbox";
            if (_itemImages.TryGetValue(type, out var image))
            {
                if (item.Quality == ItemQuality.Unique && image.Unique.Length > 0) return image.Unique;
                if (item.Quality == ItemQuality.Set && image.Set.Length > 0) return image.Set;
                return image.Normal;
            }
            return null;
        }

        private static uint GetItemCode(string code)
        {
            uint val = 0;
            string padded = code.PadRight(4);
            for (int i = 0; i < 4; i++)
            {
                val |= (uint)padded[i] << (8 * i);
            }
            return val;
        }

        public static List<Stat> GetGemStats(string gemCode, string parentCode)
        {
            var stats = new List<Stat>();
            if (!_gems.TryGetValue(gemCode, out var entry)) return stats;

            var parentIndex = D2SSharp.Data.TxtFileExternalData.Default.GetItemIndex(GetItemCode(parentCode), 105);
            var parentInfo = D2SSharp.Data.TxtFileExternalData.Default.GetItemInfo(parentIndex, 105);

            List<GemMod> mods;
            if (parentInfo.IsWeapon)
            {
                mods = entry.WeaponMods;
            }
            else if (_shieldCodes.Contains(parentCode.Trim()))
            {
                mods = entry.ShieldMods;
            }
            else
            {
                mods = entry.HelmMods;
            }

            foreach (var mod in mods)
            {
                stats.AddRange(MapGemModToStats(mod.Code, mod.Value));
            }

            return stats;
        }

        private static List<Stat> MapGemModToStats(string code, int val)
        {
            var list = new List<Stat>();
            switch (code.ToLower().Trim())
            {
                case "res-fire":
                    list.Add(new Stat { Id = StatId.FireResist, Value = val });
                    break;
                case "res-cold":
                    list.Add(new Stat { Id = StatId.ColdResist, Value = val });
                    break;
                case "res-ltng":
                    list.Add(new Stat { Id = StatId.LightningResist, Value = val });
                    break;
                case "res-pois":
                    list.Add(new Stat { Id = StatId.PoisonResist, Value = val });
                    break;
                case "res-all":
                    list.Add(new Stat { Id = StatId.FireResist, Value = val });
                    list.Add(new Stat { Id = StatId.ColdResist, Value = val });
                    list.Add(new Stat { Id = StatId.LightningResist, Value = val });
                    list.Add(new Stat { Id = StatId.PoisonResist, Value = val });
                    break;
                case "str":
                    list.Add(new Stat { Id = StatId.Strength, Value = val });
                    break;
                case "dex":
                    list.Add(new Stat { Id = StatId.Dexterity, Value = val });
                    break;
                case "vit":
                    list.Add(new Stat { Id = StatId.Vitality, Value = val });
                    break;
                case "enr":
                    list.Add(new Stat { Id = StatId.Energy, Value = val });
                    break;
                case "find-magic":
                    list.Add(new Stat { Id = StatId.MagicFind, Value = val });
                    break;
                case "mana":
                    list.Add(new Stat { Id = StatId.MaxMana, Value = val });
                    break;
                case "hp":
                case "life":
                    list.Add(new Stat { Id = StatId.MaxLife, Value = val });
                    break;
            }
            return list;
        }
    }

    class Program
    {
        private static string ToUiStatName(StatId statId) => statId switch
        {
            StatId.Strength => "strength",
            StatId.Dexterity => "dexterity",
            StatId.Vitality => "vitality",
            StatId.Energy => "energy",
            StatId.MagicFind => "item_magicbonus",
            StatId.FasterCastRate => "item_fastercastrate",
            StatId.FasterHitRecovery => "item_fastergethitrate",
            StatId.FireResist => "fireresist",
            StatId.ColdResist => "coldresist",
            StatId.LightningResist => "lightresist",
            StatId.PoisonResist => "poisonresist",
            StatId.MaxFireResist => "maxfireresist",
            StatId.MaxColdResist => "maxcoldresist",
            StatId.MaxLightningResist => "maxlightresist",
            StatId.MaxPoisonResist => "maxpoisonresist",
            _ => statId.ToString()
        };

        private static object[] SerializeStats(System.Collections.Generic.IEnumerable<Stat> stats) =>
            stats.Select(stat => (object)new
            {
                id = (uint)stat.Id,
                name = ToUiStatName(stat.Id),
                values = new[] { stat.Value },
                description = $"{stat.Id}: {stat.Value}"
            }).ToArray();

        private static object SerializeItem(Item i, uint version, int altPositionId, string parentCode = "")
        {
            byte[] itemBytes = new byte[2048];
            var bitWriter = new D2SSharp.IO.BitWriter(itemBytes);
            i.Write(ref bitWriter, D2SSharp.Data.TxtFileExternalData.Default, version);
            int itemByteLen = bitWriter.BytesWritten;
            byte[] exactItemBytes = itemBytes.AsSpan(0, itemByteLen).ToArray();

            string? uniqueName = null;
            string? setName = null;
            ItemTransform? transform = null;
            if (i.Quality == ItemQuality.Unique && i.QualityData is SetUniqueQualityData uniqData)
            {
                uniqueName = D2Data.GetUniqueName(uniqData.SetUniqueFileIndex);
                transform = D2Data.GetUniqueTransform(uniqueName);
            }
            else if (i.Quality == ItemQuality.Set && i.QualityData is SetUniqueQualityData setData)
            {
                var setInfo = D2Data.GetSetItem(setData.SetUniqueFileIndex);
                if (setInfo != null)
                {
                    uniqueName = setInfo.Value.ItemName;
                    setName = setInfo.Value.SetName;
                    transform = D2Data.GetSetTransform(setData.SetUniqueFileIndex);
                }
            }

            string? runewordName = null;
            if (i.Flags.HasFlag(ItemFlags.Runeword) && i.RunewordId.HasValue)
            {
                int rwId = i.RunewordId.Value & 0x0FFF;
                runewordName = D2Data.GetRunewordName(rwId);
            }

            var itemStats = new System.Collections.Generic.List<Stat>(i.Stats);
            if (!string.IsNullOrEmpty(parentCode))
            {
                var gemStats = D2Data.GetGemStats(i.ItemCodeString.Trim(), parentCode);
                itemStats.AddRange(gemStats);
            }

            var combinedStats = new System.Collections.Generic.List<Stat>(i.Stats);
            if (i.RunewordStats != null)
            {
                combinedStats.AddRange(i.RunewordStats);
            }
            foreach (var socketed in i.Sockets)
            {
                if (socketed != null)
                {
                    combinedStats.AddRange(socketed.Stats);
                    var gemStats = D2Data.GetGemStats(socketed.ItemCodeString.Trim(), i.ItemCodeString);
                    combinedStats.AddRange(gemStats);
                }
            }

            var imageKey = D2Data.GetInventoryFile(i);
            return new
            {
                id = i.ItemSeed,
                type = i.ItemCodeString,
                type_name = i.ItemCodeString,
                inv_file = imageKey,
                image_key = imageKey,
                inv_transform = transform?.InvTransform,
                chr_transform = transform?.ChrTransform,
                transform_color = transform?.TransformColor,
                location_id = (int)i.Position.Mode,
                equipped_id = (int)i.Position.BodyLocation,
                position_x = (int)i.Position.InvX,
                position_y = (int)i.Position.InvY,
                alt_position_id = altPositionId,
                quality = (int)i.Quality,
                socketed = i.Flags.HasFlag(ItemFlags.Socketed) ? 1 : 0,
                unique_name = uniqueName,
                set_name = setName,
                runeword_name = runewordName,
                rawBytesHex = Convert.ToHexString(exactItemBytes),
                magic_attributes = SerializeStats(itemStats),
                runeword_attributes = SerializeStats(i.RunewordStats ?? []),
                set_attributes = i.SetBonusStats.Select(SerializeStats).ToArray(),
                displayed_combined_magic_attributes = SerializeStats(combinedStats),
                socketed_items = i.Sockets.Where(s => s != null).Select(s => SerializeItem(s!, version, 0, i.ItemCodeString)).ToArray()
            };
        }

        private static int MapStorePage(StorePage storePage) => storePage switch
        {
            StorePage.Inventory => 1,
            StorePage.Stash => 5,
            _ => (int)storePage
        };

        private static object SerializeBoxWithItems(Item i, uint version, int altPositionId, System.Collections.Generic.List<Item> nestedItems)
        {
            var serialized = (dynamic)SerializeItem(i, version, altPositionId);
            return new
            {
                id = serialized.id,
                type = serialized.type,
                type_name = serialized.type_name,
                inv_file = serialized.inv_file,
                image_key = serialized.image_key,
                inv_transform = serialized.inv_transform,
                chr_transform = serialized.chr_transform,
                transform_color = serialized.transform_color,
                location_id = serialized.location_id,
                equipped_id = serialized.equipped_id,
                position_x = serialized.position_x,
                position_y = serialized.position_y,
                alt_position_id = serialized.alt_position_id,
                quality = serialized.quality,
                socketed = serialized.socketed,
                unique_name = serialized.unique_name,
                set_name = serialized.set_name,
                runeword_name = serialized.runeword_name,
                rawBytesHex = serialized.rawBytesHex,
                magic_attributes = serialized.magic_attributes,
                runeword_attributes = serialized.runeword_attributes,
                set_attributes = serialized.set_attributes,
                displayed_combined_magic_attributes = serialized.displayed_combined_magic_attributes,
                socketed_items = nestedItems.Select(n => SerializeItem(n, version, 0, i.ItemCodeString)).ToArray()
            };
        }

        static void Main(string[] args)
        {
            if (args.Length < 2)
            {
                Console.Error.WriteLine("Invalid usage.");
                Console.Error.WriteLine("Stash Remove: D2RStashWorker remove <source> <target> <itemSeed>");
                Console.Error.WriteLine("Stash Add: D2RStashWorker add <source> <target> <itemHexBytes> <tabIdx> <x> <y>");
                Console.Error.WriteLine("Save Remove: D2RStashWorker remove_save <source> <target> <itemSeed>");
                Console.Error.WriteLine("Save Add: D2RStashWorker add_save <source> <target> <itemHexBytes> <x> <y>");
                Console.Error.WriteLine("Save Parse: D2RStashWorker parse_save <source>");
                Environment.Exit(1);
            }

            string mode = args[0].ToLower();
            string sourceFile = args[1];

            try
            {
                byte[] bytes = File.ReadAllBytes(sourceFile);

                if (mode == "parse_save")
                {
                    var save = D2Save.Read(bytes);
                    var character = save.Character;
                    
                    var boxItem = save.Items.FirstOrDefault(i => i.ItemCodeString.Trim() == "box");
                    var cubeItems = save.Items.Where(i => i.Position.Mode == ItemMode.Stored && i.Position.StorePage == StorePage.Cube).ToList();
                    var otherItems = save.Items.Where(i => !(i.Position.Mode == ItemMode.Stored && i.Position.StorePage == StorePage.Cube)).ToList();

                    var serializedItems = new System.Collections.Generic.List<object>();
                    foreach (var i in otherItems)
                    {
                        if (i == boxItem)
                        {
                            serializedItems.Add(SerializeBoxWithItems(i, save.Version, MapStorePage(i.Position.StorePage), cubeItems));
                        }
                        else
                        {
                            serializedItems.Add(SerializeItem(i, save.Version, MapStorePage(i.Position.StorePage)));
                        }
                    }

                    var parsed = new
                    {
                        name = save.Version >= 104 ? save.Character.Preview.Name : save.Character.Name,
                        @class = character.Class.ToString(),
                        level = character.Level,
                        is_expansion = true,
                        header = new
                        {
                            name = save.Version >= 104 ? save.Character.Preview.Name : save.Character.Name,
                            level = character.Level
                        },
                        attributes = new
                        {
                            strength = save.Stats.GetStat(StatId.Strength),
                            dexterity = save.Stats.GetStat(StatId.Dexterity),
                            vitality = save.Stats.GetStat(StatId.Vitality),
                            energy = save.Stats.GetStat(StatId.Energy),
                            level = save.Stats.GetStat(StatId.Level),
                            gold = save.Stats.GetStat(StatId.Gold),
                            stashed_gold = save.Stats.GetStat(StatId.StashGold)
                        },
                        items = serializedItems.ToArray(),
                        contained_items = cubeItems.Select(i => SerializeItem(i, save.Version, 0, boxItem?.ItemCodeString ?? string.Empty)).ToArray(),
                        merc_items = (save.MercItems?.Items ?? []).Select(i => SerializeItem(i, save.Version, 0)).ToArray(),
                        corpse_items = save.Corpses.SelectMany(c => c.Items).Select(i => SerializeItem(i, save.Version, 0)).ToArray(),
                        iron_golem_item = save.IronGolem?.GolemItem == null ? null : SerializeItem(save.IronGolem.GolemItem, save.Version, 0)
                    };

                    var jsonOptions = new JsonSerializerOptions
                    {
                        WriteIndented = false,
                        DefaultIgnoreCondition = JsonIgnoreCondition.Never
                    };
                    string jsonOutput = JsonSerializer.Serialize(parsed, jsonOptions);
                    Console.WriteLine(jsonOutput);
                    Environment.Exit(0);
                }

                if (mode == "parse_stash")
                {
                    var stash = D2StashSave.Read(bytes);
                    var parsed = new
                    {
                        type = 0,
                        sharedGold = stash.FirstOrDefault()?.Gold ?? 0,
                        pageCount = stash.Count,
                        pages = stash.Select((tab, tabIdx) => new
                        {
                            name = tab.TabType.ToString(),
                            type = (int)tab.TabType,
                            items = tab.Items.Select(i => SerializeItem(i, tab.ItemFormat, tabIdx)).ToArray()
                        }).ToArray()
                    };

                    var jsonOptions = new JsonSerializerOptions
                    {
                        WriteIndented = false,
                        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
                    };
                    string jsonOutput = JsonSerializer.Serialize(parsed, jsonOptions);
                    Console.WriteLine(jsonOutput);
                    Environment.Exit(0);
                }

                if (mode == "verify_save")
                {
                    if (bytes.Length < 16)
                        throw new InvalidDataException("Save is too small to contain a valid header.");

                    var verification = new
                    {
                        validChecksum = D2Save.VerifyChecksum(bytes),
                        declaredFileSize = BitConverter.ToUInt32(bytes, 8),
                        actualFileSize = bytes.Length
                    };
                    Console.WriteLine(JsonSerializer.Serialize(verification));
                    Environment.Exit(verification.validChecksum && verification.declaredFileSize == verification.actualFileSize ? 0 : 1);
                }

                if (args.Length < 3)
                {
                    Console.Error.WriteLine("Missing target file argument.");
                    Environment.Exit(1);
                }
                string targetFile = args[2];

                if (mode == "roundtrip_save")
                {
                    File.WriteAllBytes(targetFile, D2Save.Read(bytes).ToBytes());
                }
                else if (mode == "roundtrip_stash")
                {
                    File.WriteAllBytes(targetFile, D2StashSave.Read(bytes).ToBytes());
                }
                else if (mode == "remove")
                {
                    if (!uint.TryParse(args[3], out uint itemId))
                    {
                        Console.Error.WriteLine("Invalid Item ID format.");
                        Environment.Exit(1);
                    }

                    var stash = D2StashSave.Read(bytes);
                    bool itemFound = false;
                    foreach (var tab in stash)
                    {
                        var item = tab.Items.FirstOrDefault(i => i.ItemSeed == itemId);
                        if (item != null)
                        {
                            tab.Items.Remove(item);
                            itemFound = true;
                            break; 
                        }
                    }

                    if (!itemFound)
                    {
                        Console.Error.WriteLine($"Item with ID {itemId} not found in stash.");
                        Environment.Exit(1);
                    }

                    byte[] outputBytes = stash.ToBytes();
                    File.WriteAllBytes(targetFile, outputBytes);
                }
                else if (mode == "add")
                {
                    if (args.Length < 7)
                    {
                        Console.Error.WriteLine("Missing arguments for add mode.");
                        Environment.Exit(1);
                    }

                    string itemHex = args[3];
                    int tabIdx = 0;
                    byte placedX = 0;
                    byte placedY = 0;
                    if (!int.TryParse(args[4], out tabIdx) || 
                        !byte.TryParse(args[5], out placedX) || 
                        !byte.TryParse(args[6], out placedY))
                    {
                        Console.Error.WriteLine("Invalid arguments for tabIdx, x, or y.");
                        Environment.Exit(1);
                    }

                    var stash = D2StashSave.Read(bytes);
                    if (tabIdx < 0 || tabIdx >= stash.Count)
                    {
                        Console.Error.WriteLine("Target tab index is out of bounds.");
                        Environment.Exit(1);
                    }

                    byte[] itemBytes = Convert.FromHexString(itemHex);
                    var targetTab = stash[tabIdx];
                    var reader = new D2SSharp.IO.BitReader(itemBytes);
                    var item = Item.Read(ref reader, D2SSharp.Data.TxtFileExternalData.Default, targetTab.ItemFormat);

                    item.Position.Mode = D2SSharp.Enums.ItemMode.Stored;
                    item.Position.BodyLocation = D2SSharp.Enums.BodyLocation.None;
                    item.Position.InvX = placedX;
                    item.Position.InvY = placedY;
                    item.Position.StorePage = D2SSharp.Enums.StorePage.Stash;

                    targetTab.Items.Add(item);

                    byte[] outputBytes = stash.ToBytes();
                    File.WriteAllBytes(targetFile, outputBytes);
                }
                else if (mode == "remove_save")
                {
                    if (!uint.TryParse(args[3], out uint itemId))
                    {
                        Console.Error.WriteLine("Invalid Item ID format.");
                        Environment.Exit(1);
                    }

                    var save = D2Save.Read(bytes);
                    var item = save.Items.FirstOrDefault(i => i.ItemSeed == itemId);
                    if (item == null)
                    {
                        Console.Error.WriteLine($"Item with ID {itemId} not found in save.");
                        Environment.Exit(1);
                    }

                    save.Items.Remove(item);

                    byte[] outputBytes = save.ToBytes();
                    File.WriteAllBytes(targetFile, outputBytes);
                }
                else if (mode == "add_save")
                {
                    if (args.Length < 6)
                    {
                        Console.Error.WriteLine("Missing arguments for add_save mode.");
                        Environment.Exit(1);
                    }

                    string itemHex = args[3];
                    byte placedX = 0;
                    byte placedY = 0;
                    if (!byte.TryParse(args[4], out placedX) || 
                        !byte.TryParse(args[5], out placedY))
                    {
                        Console.Error.WriteLine("Invalid arguments for x or y.");
                        Environment.Exit(1);
                    }

                    var save = D2Save.Read(bytes);
                    byte[] itemBytes = Convert.FromHexString(itemHex);
                    var reader = new D2SSharp.IO.BitReader(itemBytes);
                    var item = Item.Read(ref reader, D2SSharp.Data.TxtFileExternalData.Default, save.Version);

                    item.Position.Mode = D2SSharp.Enums.ItemMode.Stored;
                    item.Position.BodyLocation = D2SSharp.Enums.BodyLocation.None;
                    item.Position.InvX = placedX;
                    item.Position.InvY = placedY;
                    item.Position.StorePage = D2SSharp.Enums.StorePage.Inventory; // Character stash uses Inventory page code

                    save.Items.Add(item);

                    byte[] outputBytes = save.ToBytes();
                    File.WriteAllBytes(targetFile, outputBytes);
                }
                else
                {
                    Console.Error.WriteLine($"Unknown mode: {mode}");
                    Environment.Exit(1);
                }

                Console.WriteLine("SUCCESS");
                Environment.Exit(0);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"FATAL ERROR: {ex.Message}");
                Environment.Exit(1);
            }
        }
    }
}
