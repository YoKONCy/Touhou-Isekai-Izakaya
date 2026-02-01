import os
import subprocess
import json

def compress_audio():
    audio_dirs = [
        "src/assets/music",
        "src/assets/audio/bgm/RPG_battle/常规",
        "src/assets/audio/bgm/RPG_battle/激战",
        "src/assets/audio/bgm/RPG_battle/轻快",
        "src/assets/audio/bgm/RPG_battle/BOSS"
    ]
    
    extensions = ('.mp3', '.wav')
    converted_files = []

    for directory in audio_dirs:
        if not os.path.exists(directory):
            print(f"Directory not found: {directory}")
            continue
            
        print(f"Processing directory: {directory}")
        for filename in os.listdir(directory):
            if filename.lower().endswith(extensions):
                input_path = os.path.join(directory, filename)
                output_filename = os.path.splitext(filename)[0] + ".ogg"
                output_path = os.path.join(directory, output_filename)
                
                print(f"Converting: {filename} -> {output_filename}")
                
                # Using libopus for high quality at low bitrate
                # 128k is plenty for background music
                cmd = [
                    "ffmpeg", "-y", "-i", input_path,
                    "-c:a", "libopus", "-b:a", "128k",
                    output_path
                ]
                
                try:
                    subprocess.run(cmd, check=True, capture_output=True)
                    converted_files.append({
                        "old": input_path,
                        "new": output_path
                    })
                    # Delete old file after successful conversion
                    os.remove(input_path)
                    print(f"Deleted old file: {filename}")
                except subprocess.CalledProcessError as e:
                    print(f"Failed to convert {filename}: {e.stderr.decode()}")

    return converted_files

if __name__ == "__main__":
    results = compress_audio()
    print(f"\nSuccessfully converted {len(results)} files.")
