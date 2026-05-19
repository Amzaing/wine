import os
import re
import requests
from concurrent.futures import ThreadPoolExecutor

def fetch_and_extract_smart(url, target_channels, headers):
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            print(f"[失败] 状态码 {response.status_code} : {url}")
            return []
        
        response.encoding = response.apparent_encoding
        content = response.text
        
        local_results = []
        
        if "#EXTM3U" in content:
            for target_channel in target_channels:
                safe_channel_name = re.escape(target_channel)
                pattern = rf"(#EXTINF:[^\n]+,\s*{safe_channel_name})[\r\n]+([a-zA-Z]+://[^\r\n]+)"
                matches = re.findall(pattern, content)
                
                for info_line, url_line in matches:
                    info_line = re.sub(r'\s*tvg-id="[^"]*"\s*', ' ', info_line)
                    if 'tvg-name=' in info_line:
                        info_line = re.sub(r'tvg-name="[^"]*"', f'tvg-name="{target_channel}"', info_line)
                    else:
                        info_line = re.sub(r'(#EXTINF:-?\d+)(\s+)', rf'\1\2tvg-name="{target_channel}" ', info_line)

                    if 'group-title=' in info_line:
                        info_line = re.sub(r'group-title="[^"]*"', 'group-title="favorite"', info_line)
                    else:
                        info_line = re.sub(r'(\s*)(\s*,\s*[^,]+$)', r'\1group-title="favorite"\2', info_line)
                    
                    info_line = re.sub(r'\s*tvg-logo="[^"]*"\s*', ' ', info_line)
                    logo_url = f'tvg-logo="https://gh-proxy.org/https://raw.githubusercontent.com/fanmingming/live/refs/heads/main/tv/{target_channel}.png"'
                    info_line = re.sub(r'(#EXTINF:-?\d+)(\s+)', rf'\1\2{logo_url} ', info_line)
                    
                    info_line = re.sub(r'\s+', ' ', info_line)
                    info_line = re.sub(r'\s*,\s*', ',', info_line)
                    
                    local_results.append((target_channel, info_line, url_line))
            print(f"[成功] 检测为 [M3U格式] : {url} (提取到 {len(local_results)} 个频道)")
            
        else:
            lines = content.splitlines()
            for line in lines:
                line = line.strip()
                if not line or "," not in line:
                    continue
                
                channel_name, url_line = line.split(",", 1)
                channel_name = channel_name.strip()
                url_line = url_line.strip()
                
                if channel_name in target_channels:
                    if not url_line.startswith(("http://", "https://", "rtmp://", "rtsp://")):
                        continue
                    
                    logo_url = f'tvg-logo="https://gh-proxy.org/https://raw.githubusercontent.com/fanmingming/live/refs/heads/main/tv/{channel_name}.png"'
                    info_line = f'#EXTINF:-1 tvg-name="{channel_name}" tvg-logo="{logo_url}" group-title="favorite",{channel_name}'
                    
                    local_results.append((channel_name, info_line, url_line))
            print(f"[成功] 检测为 [TXT格式] : {url} (提取到 {len(local_results)} 个频道)")
            
        return local_results
    except Exception as e:
        print(f"[错误] 无法连接到源 {url} : {e}")
        return []

def extract_from_mixed_sources(url_list, output_file_path, target_channels, max_workers=5):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    all_matches = []
    print(f"开始从 {len(url_list)} 个混合网络源中并行提取节目...\n")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(fetch_and_extract_smart, url, target_channels, headers) for url in url_list]
        for future in futures:
            all_matches.extend(future.result())
            
    channel_dict = {channel: {} for channel in target_channels}
    for channel_name, info_line, url_line in all_matches:
        if url_line not in channel_dict[channel_name]:
            channel_dict[channel_name][url_line] = info_line

    m3u_lines = ["#EXTM3U"]
    total_count = 0
    
    print("\n正在全局汇总并去重...")
    for channel in target_channels:
        sources = channel_dict[channel]
        if sources:
            print(f" -> 频道 [{channel}] 去重后保留 {len(sources)} 个有效源")
            for url_line, info_line in sources.items():
                m3u_lines.append(info_line)
                m3u_lines.append(url_line)
                total_count += 1
        else:
            print(f" -> 频道 [{channel}] 未在任何网络源中找到")

    if total_count > 0:
        with open(output_file_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(m3u_lines))
        print(f"\n[完成] 完美的 M3U 播放列表已写入: {output_file_path} (全局共合并 {total_count} 个流地址)")
    else:
        print("\n[提示] 未提取到任何有效频道，未生成文件。")

if __name__ == "__main__":
    
    url_config = "urls.txt"
    channel_config = "channels.txt"
    output_txt = "wine.txt"
    
    if os.path.exists(url_config):
        with open(url_config, 'r', encoding='utf-8') as f:
            txt_urls = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]
    else:
        print(f"[错误] 找不到网址配置文件: {url_config}")
        txt_urls = []

    if os.path.exists(channel_config):
        with open(channel_config, 'r', encoding='utf-8') as f:
            my_channels = [line.strip() for line in f if line.strip() and not line.strip().startswith("#")]
    else:
        print(f"[错误] 找不到频道配置文件: {channel_config}")
        my_channels = []

    if txt_urls and my_channels:
        print(f"成功加载: {len(txt_urls)} 个混合源网址，目标关注频道: {len(my_channels)} 个。")
        extract_from_mixed_sources(txt_urls, output_txt, my_channels, max_workers=5)
