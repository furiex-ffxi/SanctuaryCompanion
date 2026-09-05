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
        private static Dictionary<int, int> _uniqueLevelRequirements = new();
        private static Dictionary<int, (string ItemName, string SetName)> _sets = new();
        private static Dictionary<int, int> _setLevelRequirements = new();
        private static Dictionary<string, ItemTransform> _uniqueTransforms = new();
        private static Dictionary<string, ItemTransform> _setTransforms = new();
        private static Dictionary<int, ItemTransform> _setTransformsById = new();
        private static Dictionary<string, GemEntry> _gems = new();
        private static Dictionary<string, (string Normal, string Unique, string Set)> _itemImages = new();
        private static Dictionary<string, string[]> _itemGfx = new();
        private static Dictionary<int, int> _prefixLevelRequirements = new();
        private static Dictionary<int, int> _suffixLevelRequirements = new();
        private static Dictionary<int, string> _skillNames = new();
        public const string ItemDataSource = "blizzhackers/d2data@477bcf63e964f39f4c774e588a79fd598ae472de";
        private static readonly HashSet<string> _accessoryCodes = new(StringComparer.OrdinalIgnoreCase) { "rin", "amu", "jew", "cm1", "cm2", "cm3" };
        public static bool IsAccessoryCode(string code) => _accessoryCodes.Contains(code.Trim());

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
            { 100, "Lionheart" }, { 101, "Lore" }, { 102, "Loyalty" }, { 103, "Lust" }, { 104, "Madness" },
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

        private static void LoadSkillNames()
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream("D2RStashWorker.Data.skill_names.tsv");
            using var reader = stream == null ? null : new StreamReader(stream);
            if (reader == null) throw new InvalidDataException("Pinned skill-name snapshot is missing.");
            reader.ReadLine();
            while (!reader.EndOfStream)
            {
                var parts = (reader.ReadLine() ?? "").Split((char)9);
                if (parts.Length >= 2 && int.TryParse(parts[0], out var id) && !string.IsNullOrWhiteSpace(parts[1]))
                    _skillNames[id] = parts[1].Trim();
            }
        }

        public static string GetSkillName(int id)
        {
            // The game data uses an internal monster-skill token for the
            // Hellfire Torch proc; use the player-facing item wording.
            if (id == 197) return "Firestorm";
            return _skillNames.TryGetValue(id, out var name) ? name : "Skill #" + id;
        }

        private static void LoadAffixRequirementData()
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream("D2RStashWorker.Data.affix-level-requirements.tsv");
            using var reader = stream == null ? null : new StreamReader(stream);
            if (reader == null) throw new InvalidDataException("Pinned affix requirement snapshot is missing.");
            reader.ReadLine();
            while (!reader.EndOfStream)
            {
                var parts = (reader.ReadLine() ?? "").Split((char)9);
                if (parts.Length < 3) continue;
                var kind = parts[0].Trim('"');
                if (!int.TryParse(parts[1].Trim('"'), out var id) || !int.TryParse(parts[2].Trim('"'), out var requirement)) continue;
                if (kind == "prefix") _prefixLevelRequirements[id] = requirement;
                else if (kind == "suffix") _suffixLevelRequirements[id] = requirement;
            }
        }

        public static int GetAffixLevelRequirement(string kind, int id)
        {
            if (id == 0) return 0;
            var table = kind == "prefix" ? _prefixLevelRequirements : _suffixLevelRequirements;
            if (!table.TryGetValue(id, out var requirement))
                throw new InvalidDataException("Missing pinned " + kind + " affix mapping for id " + id + ".");
            return requirement;
        }
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
                LoadAffixRequirementData();
                LoadSkillNames();
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
                                var levelReqIndex = Array.IndexOf(headers, "lvl req");
                                if (levelReqIndex >= 0 && levelReqIndex < parts.Length && int.TryParse(parts[levelReqIndex], out var levelReq))
                                    _uniqueLevelRequirements[id] = levelReq;
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
                                var levelReqIndex = Array.IndexOf(headers, "lvl req");
                                if (levelReqIndex >= 0 && levelReqIndex < parts.Length && int.TryParse(parts[levelReqIndex], out var levelReq))
                                    _setLevelRequirements[id] = levelReq;
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

        public static string? GetUniqueName(int id) => _uniques.TryGetValue(id, out var val) ? CanonicalizeUniqueName(val) : null;
        private static string CanonicalizeUniqueName(string name) => name.Trim().ToLowerInvariant() switch
        {
            "irices shard" => "Spectral Shard",
            "cutthroat1" => "Bartuc's Cut-Throat",
            "unique warlock helm" => "Hellwarden's Will",
            "wartraveler" => "War Traveler",
            "peasent crown" => "Peasant Crown",
            "eschuta's temper" => "Eschuta's Temper",
            _ => name,
        };
        public static int GetUniqueLevelRequirement(int id) => _uniqueLevelRequirements.GetValueOrDefault(id);
        public static bool HasUniqueLevelRequirement(int id) => _uniqueLevelRequirements.ContainsKey(id);
        public static int GetSetLevelRequirement(int id) => _setLevelRequirements.GetValueOrDefault(id);
        public static bool HasSetLevelRequirement(int id) => _setLevelRequirements.ContainsKey(id);
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

        private static readonly Dictionary<string, string> _baseNames = new(StringComparer.OrdinalIgnoreCase) {
            {"r01", "El Rune"}, {"r02", "Eld Rune"}, {"r03", "Tir Rune"}, {"r04", "Nef Rune"}, {"r05", "Eth Rune"}, {"r06", "Ith Rune"}, {"r07", "Tal Rune"}, {"r08", "Ral Rune"}, {"r09", "Ort Rune"}, {"r10", "Thul Rune"},
            {"r11", "Amn Rune"}, {"r12", "Sol Rune"}, {"r13", "Shael Rune"}, {"r14", "Dol Rune"}, {"r15", "Hel Rune"}, {"r16", "Io Rune"}, {"r17", "Lum Rune"}, {"r18", "Ko Rune"}, {"r19", "Fal Rune"}, {"r20", "Lem Rune"},
            {"r21", "Pul Rune"}, {"r22", "Um Rune"}, {"r23", "Mal Rune"}, {"r24", "Ist Rune"}, {"r25", "Gul Rune"}, {"r26", "Vex Rune"}, {"r27", "Ohm Rune"}, {"r28", "Lo Rune"}, {"r29", "Sur Rune"}, {"r30", "Ber Rune"},
            {"r31", "Jah Rune"}, {"r32", "Cham Rune"}, {"r33", "Zod Rune"},
            {"gcv", "Chipped Amethyst"}, {"gfv", "Flawed Amethyst"}, {"gsv", "Amethyst"}, {"gzv", "Flawless Amethyst"}, {"gpv", "Perfect Amethyst"},
            {"gcy", "Chipped Topaz"}, {"gfy", "Flawed Topaz"}, {"gsy", "Topaz"}, {"gly", "Flawless Topaz"}, {"gpy", "Perfect Topaz"},
            {"gcb", "Chipped Sapphire"}, {"gfb", "Flawed Sapphire"}, {"gsb", "Sapphire"}, {"glb", "Flawless Sapphire"}, {"gpb", "Perfect Sapphire"},
            {"gcg", "Chipped Emerald"}, {"gfg", "Flawed Emerald"}, {"gsg", "Emerald"}, {"glg", "Flawless Emerald"}, {"gpg", "Perfect Emerald"},
            {"gcr", "Chipped Ruby"}, {"gfr", "Flawed Ruby"}, {"gsr", "Ruby"}, {"glr", "Flawless Ruby"}, {"gpr", "Perfect Ruby"},
            {"gcw", "Chipped Diamond"}, {"gfw", "Flawed Diamond"}, {"gsw", "Diamond"}, {"glw", "Flawless Diamond"}, {"gpw", "Perfect Diamond"},
            {"skc", "Chipped Skull"}, {"skf", "Flawed Skull"}, {"sku", "Skull"}, {"skl", "Flawless Skull"}, {"skz", "Perfect Skull"},
            {"std", "Standard of Heroes"},
            {"xa1", "Western Worldstone Shard"}, {"xa2", "Eastern Worldstone Shard"}, {"xa3", "Southern Worldstone Shard"}, {"xa4", "Deep Worldstone Shard"}, {"xa5", "Northern Worldstone Shard"},
            {"toa", "Token of Absolution"}, {"tes", "Twisted Essence of Suffering"}, {"ceh", "Charged Essence of Hatred"}, {"bet", "Burning Essence of Terror"}, {"fed", "Festering Essence of Destruction"},
            {"pk1", "Key of Terror"}, {"pk2", "Key of Hate"}, {"pk3", "Key of Destruction"},
            {"dhn", "Diablo's Horn"}, {"bey", "Baal's Eye"}, {"mbr", "Mephisto's Brain"},
            {"rvs", "Rejuvenation Potion"}, {"rvl", "Full Rejuvenation Potion"}
        };

        public static string GetBaseName(string code) => _baseNames.TryGetValue(code.Trim(), out var name) ? name : code;
    }

    class Program
    {
        private static string ToSkillTabName(int layer) => layer switch {
            0 or 1 or 2 => "Amazon",
            3 or 4 or 5 => "Sorceress",
            6 or 7 or 8 => "Necromancer",
            9 or 10 or 11 => "Paladin",
            12 or 13 or 14 => "Barbarian",
            15 or 16 or 17 => "Druid",
            18 or 19 or 20 => "Assassin",
            21 or 22 or 23 or 48 or 49 or 50 => "Warlock",
            56 => "Demon",
            57 => "Eldritch",
            58 => "Chaos",
            _ => "Unknown"
        };

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

        private static string ToFriendlyStatName(StatId statId) => statId switch
        {
            StatId.Strength => "Strength", StatId.Dexterity => "Dexterity", StatId.Vitality => "Vitality", StatId.Energy => "Energy",
            StatId.Life or StatId.MaxLife => "Life", StatId.Mana or StatId.MaxMana => "Mana", StatId.Stamina or StatId.MaxStamina => "Stamina",
            StatId.ArmorClass => "Defense", StatId.AttackRating => "Attack Rating", StatId.AttackRatingPercent => "Attack Rating",
            StatId.ChanceToBlock => "Chance to Block", StatId.DamagePercent or StatId.MaxDamagePercent or StatId.MinDamagePercent => "Enhanced Damage",
            StatId.FireResist => "Fire Resistance", StatId.ColdResist => "Cold Resistance", StatId.LightningResist => "Lightning Resistance", StatId.PoisonResist => "Poison Resistance",
            StatId.MaxFireResist => "Maximum Fire Resistance", StatId.MaxColdResist => "Maximum Cold Resistance", StatId.MaxLightningResist => "Maximum Lightning Resistance", StatId.MaxPoisonResist => "Maximum Poison Resistance",
            StatId.MagicResist => "Magic Resistance", StatId.MaxMagicResist => "Maximum Magic Resistance", StatId.MagicFind => "Magic Find", StatId.GoldFind => "Extra Gold from Monsters",
            StatId.FasterCastRate => "Faster Cast Rate", StatId.FasterHitRecovery => "Faster Hit Recovery", StatId.FasterRunWalk => "Faster Run/Walk", StatId.IncreasedAttackSpeed => "Increased Attack Speed", StatId.FasterBlockRate => "Faster Block Rate",
            StatId.LifeSteal => "Life Stolen per Hit", StatId.ManaSteal => "Mana Stolen per Hit", StatId.AllSkills => "All Skills", StatId.AddClassSkills => "Class Skills", StatId.AddSkillTab => "Skill Tab",
            StatId.SingleSkill or StatId.NonClassSkill => "Skill", StatId.CannotBeFrozen => "Cannot Be Frozen", StatId.CrushingBlow => "Crushing Blow", StatId.DeadlyStrike => "Deadly Strike", StatId.OpenWounds => "Open Wounds", StatId.Knockback => "Knockback",
            StatId.HealAfterKill => "Life after Each Kill", StatId.ManaAfterKill => "Mana after Each Kill", StatId.ReducePrices => "Reduced Vendor Prices", StatId.LightRadius => "Light Radius", StatId.RequirementPercent => "Requirements", StatId.NumSockets => "Sockets",
            _ => HumanizeStatName(statId.ToString())
        };

        private static string HumanizeStatName(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "Stat";
            var text = System.Text.RegularExpressions.Regex.Replace(value, "([a-z])([A-Z])", "$1 $2");
            return text.Replace("Percent", "%").Replace("PerLevel", " per Level").Trim();
        }

        private static string? SkillTabName(int packedLayer)
        {
            // AddSkillTab stores the class in the upper bits and the tab in the lower 3 bits.
            // For example, 41 = (Druid class 5 << 3) | Shape Shifting tab 1.
            var classIndex = packedLayer >> 3;
            var tabIndex = packedLayer & 0x7;
            return (classIndex, tabIndex) switch
            {
                (0, 0) => "Amazon Bow and Crossbow", (0, 1) => "Amazon Javelin and Spear", (0, 2) => "Amazon Passive and Magic",
                (1, 0) => "Sorceress Fire", (1, 1) => "Sorceress Lightning", (1, 2) => "Sorceress Cold",
                (2, 0) => "Necromancer Curses", (2, 1) => "Necromancer Poison and Bone", (2, 2) => "Necromancer Summoning",
                (3, 0) => "Paladin Combat", (3, 1) => "Paladin Offensive Auras", (3, 2) => "Paladin Defensive Auras",
                (4, 0) => "Barbarian Combat Skills", (4, 1) => "Barbarian Warcries", (4, 2) => "Barbarian Masteries",
                (5, 0) => "Druid Elemental", (5, 1) => "Druid Shape Shifting", (5, 2) => "Druid Summoning",
                (6, 0) => "Assassin Martial Arts", (6, 1) => "Assassin Shadow Disciplines", (6, 2) => "Assassin Traps",
                (7, 0) => "Demon", (7, 1) => "Eldritch", (7, 2) => "Chaos",
                _ => null
            };
        }

        private static long ToUiStatValue(Stat stat, uint version)
        {
            var info = D2SSharp.Data.TxtFileExternalData.Default.GetStatInfo(stat.Id, version);
            return stat.Value >> info.ValShift;
        }

        private static string Signed(long value) => value >= 0 ? "+" + value : value.ToString();

        private static string ToUiStatDescription(Stat stat, uint version)
        {
            var value = ToUiStatValue(stat, version);
            if (stat.Id == StatId.AddSkillTab)
            {
                var tab = SkillTabName(stat.Layer) ?? "Skill Tab " + stat.Layer;
                return Signed(value) + " to " + tab + " Skills";
            }
            if (stat.Id == StatId.AddClassSkills)
            {
                var className = stat.Layer switch
                {
                    0 => "Amazon", 1 => "Sorceress", 2 => "Necromancer", 3 => "Paladin",
                    4 => "Barbarian", 5 => "Druid", 6 => "Assassin", 7 => "Warlock",
                    _ => "Class #" + stat.Layer
                };
                return Signed(value) + " to " + className + " Skill Levels";
            }
            if (stat.Id is StatId.SingleSkill or StatId.NonClassSkill)
                return Signed(value) + " to " + D2Data.GetSkillName(stat.Layer);

            var triggerPhrase = stat.Id switch
            {
                StatId.SkillOnAttack => "on attack",
                StatId.SkillOnKill => "after each Kill",
                StatId.SkillOnDeath => "when you die",
                StatId.SkillOnHit => "on striking",
                StatId.SkillOnLevelUp => "when you Level-Up",
                StatId.SkillOnGetHit => "when struck",
                _ => null
            };
            if (triggerPhrase != null)
            {
                var skillId = stat.Layer >> 6;
                var level = stat.Layer & 0x3F;
                return value + "% Chance to cast level " + level + " " + D2Data.GetSkillName(skillId) + " " + triggerPhrase;
            }
            if (stat.Id == StatId.ItemChargedSkill)
            {
                var skillId = stat.Layer >> 6;
                var level = stat.Layer & 0x3F;
                var current = value & 0xFF;
                var maximum = value >> 8;
                return "Level " + level + " " + D2Data.GetSkillName(skillId) + " (" + current + "/" + maximum + " Charges)";
            }
            if (stat.Id is StatId.Knockback or StatId.SlainMonstersRestInPeace or StatId.PreventMonsterHeal
                or StatId.HalfFreezeDuration or StatId.Indestructible or StatId.CannotBeFrozen)
                return ToFriendlyStatName(stat.Id);
            if (stat.Id == StatId.ReplenishDurability)
                return "Repairs " + (value / 100.0).ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) + " durability per second";
            if (stat.Id == StatId.ReplenishQuantity)
                return "Replenishes quantity by " + (value / 100.0).ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) + " per second";

            var percent = stat.Id is StatId.ArmorPercent or StatId.DamagePercent
                or StatId.FireResist or StatId.ColdResist or StatId.LightningResist or StatId.PoisonResist
                or StatId.MaxFireResist or StatId.MaxColdResist or StatId.MaxLightningResist or StatId.MaxPoisonResist
                or StatId.MagicFind or StatId.GoldFind or StatId.FasterCastRate or StatId.FasterHitRecovery
                or StatId.FasterRunWalk or StatId.IncreasedAttackSpeed or StatId.FasterBlockRate
                or StatId.LifeSteal or StatId.ManaSteal or StatId.OpenWounds or StatId.CrushingBlow
                or StatId.DeadlyStrike or StatId.RequirementPercent or StatId.DamageTakenGoesToMana;
            return Signed(value) + (percent ? "%" : "") + " " + ToFriendlyStatName(stat.Id);
        }

        private static object SerializedStat(Stat stat, long[] values, string description) => new
        {
            id = (uint)stat.Id,
            name = ToUiStatName(stat.Id),
            label = stat.Id == StatId.AddSkillTab ? (SkillTabName(stat.Layer) ?? "Skill Tab " + stat.Layer) : ToFriendlyStatName(stat.Id),
            layer = stat.Layer,
            values,
            skill_tab_name = stat.Id == StatId.AddSkillTab ? ToSkillTabName(stat.Layer) : null,
            description
        };

        private static object[] SerializeStats(System.Collections.Generic.IEnumerable<Stat> source, uint version)
        {
            var stats = source.ToList();
            var result = new System.Collections.Generic.List<object>();
            for (var index = 0; index < stats.Count; index++)
            {
                var stat = stats[index];
                long Value(Stat value) => ToUiStatValue(value, version);
                bool NextIs(StatId id, int offset = 1) => index + offset < stats.Count && stats[index + offset].Id == id;

                if (stat.Id == StatId.PoisonCount) continue;
                if (stat.Id == StatId.MaxDamagePercent && NextIs(StatId.MinDamagePercent))
                {
                    var maximum = Value(stat);
                    var minimum = Value(stats[index + 1]);
                    if (minimum == maximum)
                    {
                        result.Add(SerializedStat(stat, new[] { minimum, maximum }, Signed(minimum) + "% Enhanced Damage"));
                    }
                    else
                    {
                        result.Add(SerializedStat(stat, new[] { maximum }, Signed(maximum) + "% Enhanced Maximum Damage"));
                        result.Add(SerializedStat(stats[index + 1], new[] { minimum }, Signed(minimum) + "% Enhanced Minimum Damage"));
                    }
                    index++;
                    continue;
                }

                var damageKind = stat.Id switch
                {
                    StatId.FireMinDamage => "fire",
                    StatId.LightningMinDamage => "lightning",
                    StatId.MagicMinDamage => "magic",
                    StatId.ColdMinDamage => "cold",
                    _ => null
                };
                var expectedMaximum = stat.Id switch
                {
                    StatId.FireMinDamage => StatId.FireMaxDamage,
                    StatId.LightningMinDamage => StatId.LightningMaxDamage,
                    StatId.MagicMinDamage => StatId.MagicMaxDamage,
                    StatId.ColdMinDamage => StatId.ColdMaxDamage,
                    _ => StatId.Terminator
                };
                if (damageKind != null && NextIs(expectedMaximum))
                {
                    var minimum = Value(stat);
                    var maximum = Value(stats[index + 1]);
                    result.Add(SerializedStat(stat, new[] { minimum, maximum }, "Adds " + minimum + "-" + maximum + " " + damageKind + " damage"));
                    index++;
                    if (stat.Id == StatId.ColdMinDamage && NextIs(StatId.ColdLength)) index++;
                    continue;
                }
                if (stat.Id == StatId.PoisonMinDamage && NextIs(StatId.PoisonMaxDamage) && NextIs(StatId.PoisonLength, 2))
                {
                    var length = Value(stats[index + 2]);
                    var minimum = Value(stat) * length / 256;
                    var maximum = Value(stats[index + 1]) * length / 256;
                    var seconds = length / 25.0;
                    var duration = seconds.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);
                    var damage = minimum == maximum ? minimum.ToString() : minimum + "-" + maximum;
                    result.Add(SerializedStat(stat, new[] { minimum, maximum, (long)Math.Round(seconds) }, "Adds " + damage + " poison damage over " + duration + " seconds"));
                    index += 2;
                    continue;
                }

                result.Add(SerializedStat(stat, new[] { Value(stat) }, ToUiStatDescription(stat, version)));
            }
            return result.ToArray();
        }

        private static (int Requirement, string Source) GetAffixRequirement(Item item)
        {
            var requirements = new List<int>();
            var sources = new List<string>();
            void Add(string kind, int id)
            {
                if (id == 0 || id == 2047) return;
                var value = D2Data.GetAffixLevelRequirement(kind, id);
                requirements.Add(value);
                sources.Add(kind + "#" + id + "=" + value);
            }

            if (item.QualityData is MagicQualityData magic)
            {
                Add("prefix", magic.PrefixId);
                Add("suffix", magic.SuffixId);
            }
            else if (item.QualityData is RareCraftQualityData rareCraft)
            {
                foreach (var id in rareCraft.Prefixes) Add("prefix", id);
                foreach (var id in rareCraft.Suffixes) Add("suffix", id);
            }

            return requirements.Count == 0
                ? (0, "")
                : (requirements.Max(), "affixes[" + string.Join(",", sources) + "]");
        }
        private static int GetBaseLevelRequirement(object itemInfo)
        {
            // LevelRequirement is available in newer local D2SSharp checkouts, but not in the pinned API.
            var property = itemInfo.GetType().GetProperty("LevelRequirement");
            if (property?.GetValue(itemInfo) is int requirement && requirement > 0) return requirement;
            return 1;
        }
        private static (int Requirement, string Source, bool Equippable) GetItemLevelRequirement(Item item, uint version)
        {
            int itemIndex = D2SSharp.Data.TxtFileExternalData.Default.GetItemIndex(item.ItemCode, version);
            var itemInfo = itemIndex >= 0 ? D2SSharp.Data.TxtFileExternalData.Default.GetItemInfo(itemIndex, version) : default;
            bool equippable = itemIndex >= 0 && (itemInfo.IsArmor || itemInfo.IsWeapon || D2Data.IsAccessoryCode(item.ItemCodeString));
            if (!equippable) return (0, D2Data.ItemDataSource + ":not-equippable", false);
            if (itemIndex < 0) throw new InvalidDataException("Missing base item requirement mapping for equippable code '" + item.ItemCodeString + "'.");
            int baseRequirement = GetBaseLevelRequirement(itemInfo);
            string source = D2Data.ItemDataSource + ":base/" + item.ItemCodeString.Trim().ToLowerInvariant();
            int qualityRequirement = 0;
            if (item.QualityData is SetUniqueQualityData qualityData)
            {
                if (item.Quality == ItemQuality.Unique)
                {
                    qualityRequirement = D2Data.GetUniqueLevelRequirement(qualityData.SetUniqueFileIndex);
                    if (!D2Data.HasUniqueLevelRequirement(qualityData.SetUniqueFileIndex)) throw new InvalidDataException("Missing unique level requirement mapping for '" + item.ItemCodeString + "'.");
                }
                else if (item.Quality == ItemQuality.Set)
                {
                    qualityRequirement = D2Data.GetSetLevelRequirement(qualityData.SetUniqueFileIndex);
                    if (!D2Data.HasSetLevelRequirement(qualityData.SetUniqueFileIndex)) throw new InvalidDataException("Missing set level requirement mapping for '" + item.ItemCodeString + "'.");
                }
            }
            int statRequirement = item.Stats.Where(stat => stat.Id == StatId.LevelRequire).Select(stat => Convert.ToInt32(stat.Value)).FirstOrDefault();
            var affixRequirement = GetAffixRequirement(item);
            int skillTabRequirement = item.Stats.Any(stat => stat.Id == StatId.AddSkillTab && stat.Value >= 3) ? 45 : 0;
            int requirement = Math.Max(1, Math.Max(Math.Max(baseRequirement + statRequirement, qualityRequirement), Math.Max(affixRequirement.Requirement, skillTabRequirement)));
            if (requirement <= 0) throw new InvalidDataException("Equippable item '" + item.ItemCodeString + "' resolved to an invalid level requirement.");
            if (qualityRequirement > 0) source = D2Data.ItemDataSource + ":" + (item.Quality == ItemQuality.Unique ? "unique" : "set") + "/" + qualityRequirement;
            if (affixRequirement.Requirement > 0) source += "+" + affixRequirement.Source;
            if (statRequirement != 0) source += "+stat92(" + statRequirement + ")";
            if (skillTabRequirement > 0) source += "+skilltab(" + skillTabRequirement + ")";
            return (requirement, source, true);
        }
        private static object SerializeItem(Item i, uint version, int altPositionId, string parentCode = "")
        {
            byte[] itemBytes = System.Buffers.ArrayPool<byte>.Shared.Rent(2048);
            string rawBytesHex;
            try
            {
                var bitWriter = new D2SSharp.IO.BitWriter(itemBytes);
                i.Write(ref bitWriter, D2SSharp.Data.TxtFileExternalData.Default, version);
                int itemByteLen = bitWriter.BytesWritten;
                rawBytesHex = Convert.ToHexString(itemBytes.AsSpan(0, itemByteLen));
            }
            finally
            {
                System.Buffers.ArrayPool<byte>.Shared.Return(itemBytes);
            }

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
            var requirement = GetItemLevelRequirement(i, version);
            return new
            {
                id = i.ItemSeed,
                stat_display_version = 1,
                item_format = version,
                type = i.ItemCodeString,
                type_name = D2Data.GetBaseName(i.ItemCodeString),
                advanced_stash_stack_size = i.AdvancedStashStackSize,
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
                defense = i.Defense,
                max_durability = i.MaxDurability,
                durability = i.Durability,
                quantity = i.Quantity,
                ethereal = i.Flags.HasFlag(ItemFlags.Ethereal),
                socketed = i.Flags.HasFlag(ItemFlags.Socketed) ? 1 : 0,
                total_nr_of_sockets = i.Sockets.Count,
                unique_name = uniqueName,
                set_name = setName,
                runeword_name = runewordName,
                level_requirement = requirement.Equippable ? requirement.Requirement : (int?)null,
                item_level = (int)i.ItemLevel,
                level_requirement_source = requirement.Source,
                equippable = requirement.Equippable,
                rawBytesHex = rawBytesHex,
                magic_attributes = SerializeStats(itemStats, version),
                runeword_attributes = SerializeStats(i.RunewordStats ?? [], version),
                set_attributes = i.SetBonusStats.Select(stats => SerializeStats(stats, version)).ToArray(),
                displayed_combined_magic_attributes = SerializeStats(combinedStats, version),
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
                stat_display_version = serialized.stat_display_version,
                item_format = serialized.item_format,
                type = serialized.type,
                type_name = serialized.type_name,
                advanced_stash_stack_size = serialized.advanced_stash_stack_size,
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
                defense = serialized.defense,
                max_durability = serialized.max_durability,
                durability = serialized.durability,
                quantity = serialized.quantity,
                ethereal = serialized.ethereal,
                socketed = serialized.socketed,
                total_nr_of_sockets = serialized.total_nr_of_sockets,
                unique_name = serialized.unique_name,
                set_name = serialized.set_name,
                runeword_name = serialized.runeword_name,
                level_requirement = serialized.level_requirement,
                item_level = serialized.item_level,
                level_requirement_source = serialized.level_requirement_source,
                equippable = serialized.equippable,
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
            if (args.Length < 2){
                Console.Error.WriteLine("Invalid usage.");
                Console.Error.WriteLine("Stash Remove: D2RStashWorker remove <source> <target> <itemSeed>");
                Console.Error.WriteLine("Stash Add: D2RStashWorker add <source> <target> <itemHexBytes> <tabIdx> <x> <y>");
                Console.Error.WriteLine("Save Remove: D2RStashWorker remove_save <source> <target> <itemSeed>");
                Console.Error.WriteLine("Save Add: D2RStashWorker add_save <source> <target> <itemHexBytes> <x> <y>");
                Console.Error.WriteLine("Save Parse: D2RStashWorker parse_save <source>");
                Console.Error.WriteLine("Item Parse: D2RStashWorker parse_item <itemHex> [version]");
                Environment.Exit(1);
            }

            string mode = args[0].ToLower();
            string sourceFile = args[1];

            try
            {
                if (mode == "parse_item")
                {
                    byte[] itemBytes = Convert.FromHexString(sourceFile);
                    uint itemVersion = 105;
                    if (args.Length >= 3 && !uint.TryParse(args[2], out itemVersion))
                        throw new InvalidDataException("Invalid item format version.");
                    var reader = new D2SSharp.IO.BitReader(itemBytes);
                    var item = Item.Read(ref reader, D2SSharp.Data.TxtFileExternalData.Default, itemVersion);
                    Console.WriteLine(JsonSerializer.Serialize(SerializeItem(item, itemVersion, 0)));
                    return;
                }

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
                    D2StashSave stash;
                    if (bytes.Length >= 4 && bytes[0] == 'S' && bytes[1] == 'S' && bytes[2] == 'S')
                    {
                        stash = new D2StashSave();
                        var reader = new D2SSharp.IO.BitReader(bytes);
                        reader.ReadUInt32(); // SSS\0
                        
                        ushort version = reader.ReadUInt16(); // "01" (0x3130) or "02" (0x3230)
                        
                        if (version == 0x3130) // "01"
                        {
                            reader.ReadUInt32(); // Unknown
                        }
                        else if (version == 0x3230) // "02"
                        {
                            reader.ReadUInt32(); // Shared Gold
                        }
                        else
                        {
                            // If it's something else, try to skip 4 bytes
                            reader.ReadUInt32();
                        }
                        
                        uint pages = reader.ReadUInt32();
                        var externalData = D2SSharp.Data.TxtFileExternalData.Default;
                        for (uint p = 0; p < pages; p++)
                        {
                            var tab = new D2StashTab { StashFormat = 2, ItemFormat = 96, TabType = 0 };
                            ushort stHeader = reader.ReadUInt16();
                            if (stHeader != 0x5453) 
                                throw new Exception($"Invalid ST header in PlugY stash at page {p}. Expected 0x5453, got 0x{stHeader:X4}. Offset: {reader.BytePosition} bytes.");
                            reader.ReadUInt32(); // flags
                            while (reader.ReadByte() != 0) { } // null terminator
                            
                            ushort jmHeader = reader.ReadUInt16();
                            if (jmHeader != 0x4D4A) 
                                throw new Exception($"Invalid JM header in PlugY stash page {p}. Expected 0x4D4A, got 0x{jmHeader:X4}.");
                                
                            ushort numItems = reader.ReadUInt16();
                            for (int i = 0; i < numItems; i++)
                            {
                                tab.Items.Add(Item.Read(ref reader, externalData, 96));
                            }
                            reader.AlignToByte();
                            stash.Add(tab);
                        }
                    }
                    else if (bytes.Length >= 2 && bytes[0] == 'J' && bytes[1] == 'M')
                    {
                        stash = new D2StashSave();
                        var tab = new D2StashTab { StashFormat = 2, ItemFormat = 96, TabType = 0 };
                        var reader = new D2SSharp.IO.BitReader(bytes);
                        reader.ReadUInt16(); // JM
                        ushort numItems = reader.ReadUInt16();
                        var externalData = D2SSharp.Data.TxtFileExternalData.Default;
                        for (int i = 0; i < numItems; i++)
                        {
                            tab.Items.Add(Item.Read(ref reader, externalData, 96));
                        }
                        stash.Add(tab);
                    }
                    else
                    {
                        stash = D2StashSave.Read(bytes);
                    }

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
                    item.Position.StorePage = D2SSharp.Enums.StorePage.Stash;

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
